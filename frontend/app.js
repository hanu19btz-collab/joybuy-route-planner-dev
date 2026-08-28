const ORS_API_KEY =
    "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjE0MzJjMTc4MjIzMDQ4N2U5ZDVlNDE4NmI5YTdkODc5IiwiaCI6Im11cm11cjY0In0=";




// Default to the first depot defined in depots.json
let currentDepot =
    DEPOTS[Object.keys(DEPOTS)[0]];
// ======================================
// MAP
// ======================================

const map =
    L.map(
        'map',
        {
            boxZoom: false
        }
    )
    .setView(
        [54.5, -3],
        6
    );

L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution:
            '&copy; OpenStreetMap contributors'
    }
).addTo(map);

// ======================================
// DATA
// ======================================

let stopsData = [];

let markers = [];

let polylines = [];
let selectedStops = [];

let isSelecting = false;

let selectionStart = null;

let selectionRectangle = null;

let routeLayers = {};

let routeCache = {};

let routeSummaries = {};

let movedStops = {};
let hiddenRoutes = [];

// ======================================
// ELEMENTS
// ======================================

const uploadBtn =
    document.getElementById(
        'uploadBtn'
    );

const exportBtn =
    document.getElementById(
        'exportBtn'
    );

const addStopBtn =
    document.getElementById(
        'addStopBtn'
    );

const depotSelector =
    document.getElementById(
        'depotSelector'
    );
    const saveSessionBtn =
    document.getElementById(
        'saveSessionBtn'
    );

const savedSessionsContainer =
    document.getElementById(
        'savedSessions'
    );
// ======================================
// BUTTON EVENTS
// ======================================

exportBtn.addEventListener(
    'click',
    exportRoutes
);
saveSessionBtn.addEventListener(
    'click',
    saveCurrentSession
);
// ======================================
// NORMALIZE ROUTE
// ======================================

function normalizeRouteName(route) {

    if (!route) return "Route 1";

    const clean = route.trim().toLowerCase();

    // Combined routes first (must check before single numbers)
    if (clean.includes("1") && clean.includes("2")) return "Route 1&2";
    if (clean.includes("3") && clean.includes("4")) return "Route 3&4";

    // Exact match against all known route names
    const known = [
        "Route 1", "Route 2", "Route 3", "Route 4",
        "Route 5", "Route 6", "Route 7", "Route 8",
        "Route 9", "Route 10", "Route 1&2", "Route 3&4"
    ];

    for (const name of known) {
        if (clean === name.toLowerCase()) return name;
    }

    // Fallback: match by number — check "10" before "1"
    if (clean.includes("10")) return "Route 10";
    if (clean.includes("1"))  return "Route 1";
    if (clean.includes("2"))  return "Route 2";
    if (clean.includes("3"))  return "Route 3";
    if (clean.includes("4"))  return "Route 4";
    if (clean.includes("5"))  return "Route 5";
    if (clean.includes("6"))  return "Route 6";
    if (clean.includes("7"))  return "Route 7";
    if (clean.includes("8"))  return "Route 8";
    if (clean.includes("9"))  return "Route 9";

    return "Route 1";
}


// ======================================
// GET ROUTES FOR CURRENT DEPOT
// ======================================

// All routes available for selection (Add Stop / Move Stop dropdowns)
// Always Route 1-10, plus any special combined routes this depot defines
function getDepotRoutes() {
    const base = [
        "Route 1","Route 2","Route 3","Route 4","Route 5",
        "Route 6","Route 7","Route 8","Route 9","Route 10"
    ];
    const special = currentDepot.routes
        ? Object.keys(currentDepot.routes).filter(r => r.includes("&"))
        : [];
    return [...base, ...special];
}

// Routes to show in sidebar:
// - Routes that have at least 1 stop loaded, OR
// - Routes defined in depot config (so they appear even before upload)
// Special routes only shown if depot defines them
function getSidebarRoutes() {
    const depotDefined = currentDepot.routes
        ? Object.keys(currentDepot.routes)
        : [];
    const withStops = [...new Set(stopsData.map(s => s.route))].filter(
        r => r && r !== "Unassigned" && r !== "Invalid"
    );
    // Base routes 1-10 always in sidebar
    const base = [
        "Route 1","Route 2","Route 3","Route 4","Route 5",
        "Route 6","Route 7","Route 8","Route 9","Route 10"
    ];
    // Special routes: only if depot defines them OR stops exist on them
    const special = [
        ...depotDefined.filter(r => r.includes("&")),
        ...withStops.filter(r => r.includes("&"))
    ];
    const allSpecial = [...new Set(special)];
    return [...base, ...allSpecial];
}

// ======================================
// DEPOT CHANGE
// ======================================

depotSelector.addEventListener(
    'change',
    async () => {

        currentDepot =
            DEPOTS[
                depotSelector.value
            ];

        await renderMap();

        renderSidebar();
    }
);


// ======================================
// UPLOAD
// ======================================

uploadBtn.addEventListener(
    'click',
    async () => {

        const fileInput =
            document.getElementById(
                'excelFile'
            );

        const file =
            fileInput.files[0];

        if (!file) {

            alert(
                "Select Excel file."
            );

            return;
        }

        uploadBtn.innerText =
            "Loading...";

        uploadBtn.disabled = true;

        clearMap();
        routeCache = {};

        movedStops = {};

        const formData =
            new FormData();

        formData.append(
            'file',
            file
        );

        try {

            const response =
    await fetch(
         `https://joybuy-route-planner-dev.onrender.com/upload?depot=${currentDepot.id}`,
                    {
                        method: 'POST',
                        body: formData
                    }
                );

            stopsData =
                await response.json();

            stopsData.forEach(
                stop => {

                    stop.id =
                        crypto.randomUUID();

                    stop.redelivery =
                        false;

                    stop.route =
                        normalizeRouteName(
                            stop.route
                        );

                    stop.color =
                        ROUTE_COLORS[
                            stop.route
                        ] || "gray";
                }
            );

            await renderMap();

            renderSidebar();

        } catch (err) {

            console.error(err);

            alert(
                "Upload error."
            );
        }

        uploadBtn.innerText =
            "Generate Routes";

        uploadBtn.disabled = false;
    }
);


// ======================================
// ADD STOP
// ======================================

addStopBtn.addEventListener(
    'click',
    async () => {

        const postcode =
            prompt(
                "Enter postcode"
            );

        if (!postcode) {
            return;
        }

        const stopType =
            prompt(
                "Enter NORMAL or REDELIVERY"
            );

        const isRedelivery =
            stopType &&
            stopType
                .trim()
                .toUpperCase() ===
            "REDELIVERY";

        let selectedRoute =
            prompt(
                "Choose Route:\n\n" + getDepotRoutes().join("\n")
            );

        selectedRoute =
            normalizeRouteName(
                selectedRoute
            );

        const routeStops =
            stopsData.filter(
                x => x.route === selectedRoute
            );

        const selectedPosition =
            parseInt(
                prompt(
                    `Enter position (1-${routeStops.length + 1})`
                )
            );

        if (
            !selectedPosition ||
            selectedPosition < 1
        ) {

            return;
        }

        try {

            const response =
                await fetch(
                    `https://api.postcodes.io/postcodes/${postcode.replace(/\s/g, '')}`
                );

            const data =
                await response.json();
console.log(data);
            if (
                data.status !== 200
            ) {

                alert(
                    "Invalid postcode"
                );

                return;
            }

            const result =
                data.result;

            const newStop = {

                id:
                    crypto.randomUUID(),

                postcode:
                    postcode.toUpperCase(),

                lat:
                    result.latitude,

                lng:
                    result.longitude,

                route:
                    selectedRoute,

                color:
                    ROUTE_COLORS[
                        selectedRoute
                    ],

                redelivery:
                    isRedelivery
            };

            let insertIndex = 0;

            let count = 0;

            for (
                let i = 0;
                i < stopsData.length;
                i++
            ) {

                if (
                    stopsData[i].route ===
                    selectedRoute
                ) {

                    if (
                        count ===
                        selectedPosition - 1
                    ) {

                        insertIndex = i;

                        break;
                    }

                    count++;
                }

                insertIndex = i + 1;
            }

            stopsData.splice(
                insertIndex,
                0,
                newStop
            );
            delete routeCache[
    selectedRoute
];

            await renderMap();

            renderSidebar();

        } catch (err) {

            console.error(err);

            alert(
                "Error adding stop"
            );
        }
    }
);


// ======================================
// CLEAR MAP
// ======================================

function clearMap() {

    markers.forEach(m =>
        map.removeLayer(m)
    );

    polylines.forEach(p =>
        map.removeLayer(p)
    );

    markers = [];

    polylines = [];

    routeSummaries = {};
}


// ======================================
// RENDER MAP
// ======================================

async function renderMap() {

    clearMap();

    const bounds = [];

    const groupedRoutes = {};

    const depotMarker = L.marker(
        [
            currentDepot.lat,
            currentDepot.lng
        ]
    )
    .addTo(map)
    .bindPopup(`
        <b>${currentDepot.name}</b><br>
        ${currentDepot.postcode}
    `);

    markers.push(depotMarker);

    bounds.push([
        currentDepot.lat,
        currentDepot.lng
    ]);

    stopsData.forEach(
    stop => {

        if (
            !stop.lat ||
            !stop.lng
        ) {
            return;
        }
        if (
    hiddenRoutes.includes(
    normalizeRouteName(
        stop.route
    )
)
) {
    return;
}

       

            const routeStops =
                stopsData.filter(
                    x => x.route === stop.route
                );

            const stopNumber =
                routeStops.findIndex(
                    x => x.id === stop.id
                ) + 1;

            const icon =
                L.divIcon({

                    className: '',

                    html: `

                        <div style="
                            position:relative;
                            width:34px;
                            height:34px;
                        ">

                            ${
                                stop.redelivery
                                ? `
                                <div style="
                                    position:absolute;
                                    top:-10px;
                                    left:10px;
                                    background:red;
                                    color:white;
                                    width:16px;
                                    height:16px;
                                    border-radius:50%;
                                    font-size:11px;
                                    font-weight:bold;
                                    display:flex;
                                    align-items:center;
                                    justify-content:center;
                                    z-index:999;
                                ">
                                    R
                                </div>
                                `
                                : ''
                            }

                           <div style="
    background:${stop.color};
    width:30px;
    height:30px;
    border-radius:50%;

    border:${
        selectedStops.includes(stop.id)
            ? '5px solid #ffffff'
            : '2px solid white'
    };

    box-shadow:${
        selectedStops.includes(stop.id)
            ? '0 0 20px #ffffff'
            : '0 0 4px rgba(0,0,0,0.5)'
    };

    transform:${
        selectedStops.includes(stop.id)
            ? 'scale(1.25)'
            : 'scale(1)'
    };

    display:flex;
    align-items:center;
    justify-content:center;

    color:white;
    font-weight:bold;
    font-size:13px;
">

                                ${stopNumber}

                            </div>

                        </div>
                    `,

                    iconSize: [34, 34]
                });

            const marker =
    L.marker(
        [
            stop.lat,
            stop.lng
        ],
        { icon }
    ).addTo(map);

marker.stopId = stop.id;

marker.stopData = stop;

marker.routeName =
    stop.route;

            marker.bindPopup(
                createPopup(stop.id)
            );

            marker.on(
                'popupopen',
                () => {

                    updatePositionOptions(
                        stop.id
                    );
                }
            );

            markers.push(marker);

            bounds.push([
                stop.lat,
                stop.lng
            ]);

            if (
                !groupedRoutes[
                    stop.route
                ]
            ) {

                groupedRoutes[
                    stop.route
                ] = [];
            }

            groupedRoutes[
                stop.route
            ].push(stop);
        }
    );

    for (
        const [route, stops]
        of Object.entries(
            groupedRoutes
        )
    ) {
     

        const sampleStop =
            stopsData.find(
                x => x.route === route
            );

        await drawRealRoute(
            route,
            stops,
            sampleStop?.color ||
            "gray"
        );
    }

    if (bounds.length > 0) {

        map.fitBounds(bounds);
    }
}


// ======================================
// DRAW ROUTE
// ======================================

async function drawRealRoute(
    routeName,
    stops,
    color
) {

    if (stops.length < 1) {
        return;
    }

    try {
        const cacheKey =
    JSON.stringify(

        stops.map(
            x => x.id
        )
    );

const cached =
    routeCache[
        routeName
    ];

if (

    cached &&

    cached.key ===
    cacheKey

) {

    routeLayers[
        routeName
    ] =
        cached.layer;

    cached.layer.addTo(map);

    polylines.push(
        cached.layer
    );

    return;
}

        const coordinates = [

            [
                currentDepot.lng,
                currentDepot.lat
            ]
        ];

        stops.forEach(stop => {

            coordinates.push([
                stop.lng,
                stop.lat
            ]);
        });

        coordinates.push([
            currentDepot.lng,
            currentDepot.lat
        ]);

        const response =
            await fetch(
                'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
                {

                    method: 'POST',

                    headers: {

                        'Authorization':
                            ORS_API_KEY,

                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({

                        coordinates:
                            coordinates,

                        instructions: false,

                        preference:
                            "recommended"
                    })
                }
            );

            const data =
                await response.json();

            if (
                !data.features ||
                !data.features.length
            ) {
                return;
            }

            const routeLayer =
                L.geoJSON(data, {

                    style: {

                        color: color,

                        weight: 5,

                        opacity: 0.8
                    }

                }).addTo(map);

            polylines.push(routeLayer);

            routeLayers[routeName] =
    routeLayer;
    routeCache[
    routeName
] = {

    key:
        cacheKey,

    layer:
        routeLayer
};

            const summary =
                data.features[0]
                    .properties
                    .summary;

            const distanceMiles =
                (
                    summary.distance *
                    0.000621371
                ).toFixed(1);

            const totalMinutes =
                Math.round(
                    summary.duration / 60
                );

            const hours =
                Math.floor(
                    totalMinutes / 60
                );

            const minutes =
                totalMinutes % 60;

            const formattedTime =
                `${hours}h ${minutes}m`;

            routeSummaries[
                routeName
            ] = {

                distance:
                    distanceMiles,

                duration:
                    formattedTime
            };

    } catch (err) {

        console.error(err);
    }
}


// ======================================
// ROUTE OPTIMIZATION (fixed first/last stop)
// ======================================

// Straight-line distance in metres (used as a fallback if the
// OpenRouteService matrix call fails or the route has too many stops)
function haversineMetres(a, b) {

    const R = 6371000;

    const dLat =
        (b.lat - a.lat) * Math.PI / 180;

    const dLng =
        (b.lng - a.lng) * Math.PI / 180;

    const lat1 =
        a.lat * Math.PI / 180;

    const lat2 =
        b.lat * Math.PI / 180;

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(h));
}

function buildHaversineMatrix(nodes) {

    const n = nodes.length;

    const matrix =
        Array.from(
            { length: n },
            () => new Array(n).fill(0)
        );

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {

            if (i !== j) {
                matrix[i][j] =
                    haversineMetres(
                        nodes[i],
                        nodes[j]
                    );
            }
        }
    }

    return matrix;
}

// OpenRouteService has a practical limit on how many locations a single
// matrix request can contain on the free plan, so very large routes fall
// back to straight-line distances instead of failing outright.
const ORS_MATRIX_MAX_LOCATIONS = 50;

async function getDistanceMatrix(nodes) {

    if (nodes.length > ORS_MATRIX_MAX_LOCATIONS) {
        return buildHaversineMatrix(nodes);
    }

    try {

        const response =
            await fetch(
                'https://api.openrouteservice.org/v2/matrix/driving-car',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': ORS_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        locations:
                            nodes.map(
                                n => [n.lng, n.lat]
                            ),
                        metrics: ['distance']
                    })
                }
            );

        const data = await response.json();

        if (!data || !data.distances) {
            throw new Error(
                'Matrix response missing distances'
            );
        }

        return data.distances;

    } catch (err) {

        console.warn(
            'ORS matrix failed, using straight-line distances instead:',
            err
        );

        return buildHaversineMatrix(nodes);
    }
}

// Solves an open-path "shortest route" problem where node 0 and the
// last node are FIXED as the start and end of the route. Builds an
// initial path with nearest-neighbour, then improves it with 2-opt
// (only reversing interior segments, so the endpoints never move).
function solveFixedEndpointsRoute(matrix) {

    const n = matrix.length;

    if (n <= 2) {
        return [...Array(n).keys()];
    }

    const visited = new Array(n).fill(false);

    visited[0] = true;
    visited[n - 1] = true;

    let path = [0];
    let current = 0;

    for (let step = 0; step < n - 2; step++) {

        let best = -1;
        let bestDist = Infinity;

        for (let j = 1; j < n - 1; j++) {

            if (
                !visited[j] &&
                matrix[current][j] < bestDist
            ) {
                bestDist = matrix[current][j];
                best = j;
            }
        }

        if (best === -1) break;

        visited[best] = true;
        path.push(best);
        current = best;
    }

    path.push(n - 1);

    function pathDistance(p) {

        let d = 0;

        for (let i = 0; i < p.length - 1; i++) {
            d += matrix[p[i]][p[i + 1]];
        }

        return d;
    }

    let bestPath = path;
    let bestDist = pathDistance(bestPath);

    let improved = true;
    let iterations = 0;

    while (improved && iterations < 300) {

        improved = false;
        iterations++;

        // --- 2-opt: reverse interior segments ---
        for (let i = 1; i < bestPath.length - 2; i++) {
            for (let j = i + 1; j < bestPath.length - 1; j++) {

                const candidate =
                    bestPath
                        .slice(0, i)
                        .concat(
                            bestPath
                                .slice(i, j + 1)
                                .reverse()
                        )
                        .concat(
                            bestPath.slice(j + 1)
                        );

                const candidateDist =
                    pathDistance(candidate);

                if (candidateDist < bestDist - 1e-6) {
                    bestPath = candidate;
                    bestDist = candidateDist;
                    improved = true;
                }
            }
        }

        // --- Or-opt: relocate a single interior stop to a better spot ---
        for (let i = 1; i < bestPath.length - 1; i++) {

            const node = bestPath[i];

            const withoutNode =
                bestPath
                    .slice(0, i)
                    .concat(bestPath.slice(i + 1));

            for (let j = 1; j < withoutNode.length; j++) {

                const candidate =
                    withoutNode
                        .slice(0, j)
                        .concat([node])
                        .concat(withoutNode.slice(j));

                const candidateDist =
                    pathDistance(candidate);

                if (candidateDist < bestDist - 1e-6) {
                    bestPath = candidate;
                    bestDist = candidateDist;
                    improved = true;
                }
            }
        }
    }

    return bestPath;
}

window.optimizeRouteOrder =
async function(route) {

    const safeRoute = route.replace(/\s/g, '');

    const startSelect =
        document.getElementById(`startSelect${safeRoute}`);

    const endSelect =
        document.getElementById(`endSelect${safeRoute}`);

    if (!startSelect || !endSelect) return;

    const startId = startSelect.value;
    const endId = endSelect.value;

    const routeStops =
        stopsData.filter(
            x => x.route === route
        );

    if (routeStops.length < 2) {
        return;
    }

    if (startId === endId) {
        alert(
            "Please choose two different stops for Start and End."
        );
        return;
    }

    const startStop =
        routeStops.find(s => s.id === startId);

    const endStop =
        routeStops.find(s => s.id === endId);

    const middleStops =
        routeStops.filter(
            s => s.id !== startId && s.id !== endId
        );

    const btn =
        document.getElementById(`optimizeBtn${safeRoute}`);

    const originalLabel = btn ? btn.innerText : null;

    if (btn) {
        btn.innerText = "Optimizing…";
        btn.disabled = true;
    }

    try {

        const nodes =
            [startStop, ...middleStops, endStop];

        const matrix =
            await getDistanceMatrix(nodes);

        const orderIdx =
            solveFixedEndpointsRoute(matrix);

        const orderedStops =
            orderIdx.map(i => nodes[i]);

        const otherStops =
            stopsData.filter(
                x => x.route !== route
            );

        stopsData = [
            ...otherStops,
            ...orderedStops
        ];

        delete routeCache[route];

        if (routeLayers[route]) {
            map.removeLayer(routeLayers[route]);
            delete routeLayers[route];
        }

        await renderMap();

        renderSidebar();

    } catch (err) {

        console.error(err);

        alert(
            "Could not optimize this route. Please try again."
        );

        if (btn) {
            btn.innerText = originalLabel;
            btn.disabled = false;
        }
    }
};




function createPopup(stopId) {

    const stop =
        stopsData.find(
            x => x.id === stopId
        );

    return `
        <div style="
            min-width:240px;
        ">

            <b style="
                font-size:20px;
            ">
                ${stop.postcode}
            </b>

            <br><br>

            Current Route:
            <b>${stop.route}</b>
<br><br>

Parcels:
<b>${stop.parcels || 0}</b>

<br><br>

<div style="
    max-height:120px;
    overflow-y:auto;
    background:#f3f4f6;
    padding:8px;
    border-radius:8px;
    font-size:12px;
">

    <b>JDW Numbers</b>

    <br><br>

    ${
        stop.jdwNumbers &&
        stop.jdwNumbers.length > 0

        ? stop.jdwNumbers.join('<br>')

        : 'No JDW Numbers'
    }

</div>

<br><br>
            <br><br>

            <label>
                Route
            </label>

            <br>

            <select
                id="routeSelect${stopId}"
                onchange="
                    updatePositionOptions('${stopId}')
                "
                style="
                    width:100%;
                    margin-top:4px;
                    margin-bottom:12px;
                    padding:6px;
                "
            >

                ${getRouteOptions(
                    stop.route
                )}

            </select>

            <label>
                Position
            </label>

            <br>

            <select
                id="positionSelect${stopId}"
                style="
                    width:100%;
                    margin-top:4px;
                    margin-bottom:14px;
                    padding:6px;
                "
            >
            </select>

            <button
                onclick="
                    moveStopToPosition('${stopId}')
                "
                style="
                    width:100%;
                    padding:10px;
                    background:#4f5fe3;
                    color:white;
                    border:none;
                    border-radius:8px;
                    font-weight:bold;
                    cursor:pointer;
                "
            >
                Move Stop
            </button>

        </div>
    `;
}


// ======================================
// ROUTE OPTIONS
// ======================================

function getRouteOptions(currentRoute) {
    return getDepotRoutes().map(
        route => `
            <option
                value="${route}"
                ${route === currentRoute ? 'selected' : ''}
            >
                ${route}
            </option>
        `
    ).join('');
}


// ======================================
// POSITION OPTIONS
// ======================================

window.updatePositionOptions =
function(stopId) {

    const routeSelect =
        document.getElementById(
            `routeSelect${stopId}`
        );

    const positionSelect =
        document.getElementById(
            `positionSelect${stopId}`
        );

    const selectedRoute =
        routeSelect.value;

    const routeStops =
        stopsData.filter(
            x => x.route === selectedRoute
        );

    positionSelect.innerHTML = '';

    let currentPosition = 1;

    for (
        let i = 0;
        i < routeStops.length;
        i++
    ) {

        if (
            routeStops[i].id === stopId
        ) {

            currentPosition =
                i + 1;

            break;
        }
    }

    for (
        let i = 1;
        i <= routeStops.length + 1;
        i++
    ) {

        positionSelect.innerHTML += `

            <option
                value="${i}"
                ${i === currentPosition ? 'selected' : ''}
            >
                ${i}
            </option>

        `;
    }
};


// ======================================
// MOVE STOP
// ======================================

window.moveStopToPosition =
async function(stopId) {

    const routeSelect =
        document.getElementById(
            `routeSelect${stopId}`
        );

    const positionSelect =
        document.getElementById(
            `positionSelect${stopId}`
        );

    let newRoute =
        routeSelect.value;

    newRoute =
        normalizeRouteName(
            newRoute
        );

    const newPosition =
        parseInt(
            positionSelect.value
        ) - 1;

    const stop =
        stopsData.find(
            x => x.id === stopId
        );

    const oldRoute =
        stop.route;

    const currentIndex =
        stopsData.findIndex(
            x => x.id === stopId
        );

    stopsData.splice(
        currentIndex,
        1
    );

    stop.route = newRoute;

    stop.color =
        ROUTE_COLORS[
            newRoute
        ];

    let insertIndex = 0;

    let count = 0;

    for (
        let i = 0;
        i < stopsData.length;
        i++
    ) {

        if (
            stopsData[i].route ===
            newRoute
        ) {

            if (
                count === newPosition
            ) {

                insertIndex = i;

                break;
            }

            count++;
        }

        insertIndex = i + 1;
    }

    stopsData.splice(
        insertIndex,
        0,
        stop
    );

    if (oldRoute !== newRoute) {

        if (
    movedStops[
        stop.postcode
    ]
) {

    movedStops[
        stop.postcode
    ].finalRoute =
        newRoute;

    movedStops[
        stop.postcode
    ].movedAt =
        new Date()
        .toLocaleString();

} else {

    movedStops[
        stop.postcode
    ] = {

        postcode:
            stop.postcode,

        originalRoute:
            oldRoute,

        finalRoute:
            newRoute,

        parcels:
            stop.parcels || 0,

        jdwNumbers:
            stop.jdwNumbers || [],

        movedAt:
            new Date()
            .toLocaleString()
    };
}
    }
    delete routeCache[
    oldRoute
];

delete routeCache[
    newRoute
];
    if (routeLayers[oldRoute]) {

    map.removeLayer(
        routeLayers[oldRoute]
    );

    delete routeLayers[oldRoute];
}

if (routeLayers[newRoute]) {

    map.removeLayer(
        routeLayers[newRoute]
    );

    delete routeLayers[newRoute];
}



    await renderMap();

    renderSidebar();
};


// ======================================
// SIDEBAR
// ======================================

function renderSidebar() {

    const routeStats =
        document.getElementById(
            'routeStats'
        );

    routeStats.innerHTML = '';

    const uniqueRoutes = getSidebarRoutes();

    uniqueRoutes.forEach(
        route => {

            const stopsForRoute =
                stopsData.filter(
                    x => x.route === route
                );

            const count =
                stopsForRoute.length;

            // Only show route card if it has stops
            if (count === 0) return;

            const safeRoute =
                route.replace(/\s/g, '');

            const stats =
                routeSummaries[
                    route
                ];

            const card =
                document.createElement(
                    'div'
                );

            card.style.background =
                ROUTE_COLORS[
                    route
                ] || "#6b7280";

            card.style.color =
                "white";

            card.style.padding =
                "14px";

            card.style.marginBottom =
                "12px";

            card.style.borderRadius =
                "12px";

            card.style.border =
                "3px solid rgba(255,255,255,0.2)";

            card.style.boxShadow =
                "0 2px 8px rgba(0,0,0,0.25)";

            card.innerHTML = `

                <div style="
                    font-size:18px;
                    font-weight:bold;
                    margin-bottom:8px;
                ">
                    ${route}
                </div>

                <div>
                    Stops: ${count}
                </div>

                <div>
                    Distance:
                    ${stats?.distance || '-'} miles
                </div>

                <div>
    Time:
    ${stats?.duration || '-'}
</div>

<br><br>
<div
    class="route-stop-list"
    id="routeList${safeRoute}"
    style="
        margin-top:15px;
        max-height:250px;
        overflow-y:auto;
        background:rgba(255,255,255,0.15);
        padding:8px;
        border-radius:8px;
    "
>

${
    stopsForRoute
        .map(
    (stop, index) => `
                <div
                    class="route-stop-item"
                    data-id="${stop.id}"
                    style="
                        background:rgba(255,255,255,0.2);
                        padding:6px;
                        margin-bottom:4px;
                        border-radius:6px;
                        cursor:pointer;
                        font-size:13px;
                    "
                >
                   <span style="
    font-size:16px;
    margin-right:8px;
">
☰
</span>

<span style="
    font-weight:bold;
    margin-right:8px;
">
(${index + 1})
</span>

${stop.postcode}
                </div>
            `
        )
        .join('')
}

</div>

${
    count >= 2
        ? `
<div style="
    margin-top:10px;
    background:rgba(255,255,255,0.15);
    padding:8px;
    border-radius:8px;
    font-size:12px;
">
    <div style="font-weight:bold; margin-bottom:6px;">
        ⚡ Optimize Order
    </div>

    <label style="display:block; margin-bottom:6px;">
        Start stop:
        <select
            id="startSelect${safeRoute}"
            style="width:100%; margin-top:2px; border-radius:4px; padding:3px;"
        >
            ${
                stopsForRoute
                    .map(
                        (stop, index) => `
                            <option
                                value="${stop.id}"
                                ${index === 0 ? 'selected' : ''}
                            >
                                ${stop.postcode}
                            </option>
                        `
                    )
                    .join('')
            }
        </select>
    </label>

    <label style="display:block; margin-bottom:8px;">
        End stop:
        <select
            id="endSelect${safeRoute}"
            style="width:100%; margin-top:2px; border-radius:4px; padding:3px;"
        >
            ${
                stopsForRoute
                    .map(
                        (stop, index) => `
                            <option
                                value="${stop.id}"
                                ${index === stopsForRoute.length - 1 ? 'selected' : ''}
                            >
                                ${stop.postcode}
                            </option>
                        `
                    )
                    .join('')
            }
        </select>
    </label>

    <button
        id="optimizeBtn${safeRoute}"
        onclick="optimizeRouteOrder('${route}')"
        style="
            width:100%;
            padding:8px;
            background:rgba(255,255,255,0.9);
            color:#111;
            border:none;
            border-radius:6px;
            font-weight:bold;
            cursor:pointer;
        "
    >
        Optimize Order
    </button>
</div>
`
        : ''
}

<label style="
    display:flex;
    align-items:center;
    gap:8px;
    margin-top:10px;
">

    <input
    type="checkbox"
    ${hiddenRoutes.includes(route) ? '' : 'checked'}
    onchange="
        toggleRoute('${route}')
    "
>

    Visible

</label>
            `;

            routeStats.appendChild(
                card
            );
            const list =
    document.getElementById(
        `routeList${route.replace(/\s/g,'')}`
    );
    new Sortable(
    list,
    {

        animation: 150,

        onEnd: async function(evt) {

    const routeStops =
        stopsData.filter(
            x => x.route === route
        );

    const movedStop =
        routeStops.splice(
            evt.oldIndex,
            1
        )[0];

    routeStops.splice(
        evt.newIndex,
        0,
        movedStop
    );

    const otherStops =
        stopsData.filter(
            x => x.route !== route
        );

    stopsData = [
        ...otherStops,
        ...routeStops
    ];

    // ștergem cache-ul rutei
    delete routeCache[
        route
    ];

    // ștergem linia veche de pe hartă
    if (
        routeLayers[
            route
        ]
    ) {

        map.removeLayer(
            routeLayers[
                route
            ]
        );

        delete routeLayers[
            route
        ];
    }

    await renderMap();

    renderSidebar();

       }
    }
    );
}
);

}


// ======================================
// EXPORT ROUTES
// ======================================

function exportRoutes() {

    try {

        const workbook =
            XLSX.utils.book_new();

        const uniqueRoutes = getSidebarRoutes();

        uniqueRoutes.forEach(
            route => {

                const routeStops =
                    stopsData.filter(
                        x => x.route === route
                    );

                if (
                    routeStops.length === 0
                ) {
                    return;
                }

                const exportData =
                    routeStops.map(
                        (
                            stop,
                            index
                        ) => ({

    Stop_Number:
        index + 1,

    Postcode:
        stop.postcode,

    Route:
        stop.route,

    Parcels:
        stop.parcels || 0,

    JDW_Numbers:
        Array.isArray(
            stop.jdwNumbers
        )

        ? stop.jdwNumbers.join(", ")

        : "",

    Redelivery:
        stop.redelivery
            ? "YES"
            : "NO"
})
                    );

                const worksheet =
                    XLSX.utils.json_to_sheet(
                        exportData
                    );

                XLSX.utils.book_append_sheet(
                    workbook,
                    worksheet,
                    route
                );
            }
        );

        // MANUAL MOVES SHEET
        if (
            Object.keys(
                movedStops
            ).length > 0
        ) {

            const manualMovesData =
                Object.values(
                    movedStops
                );
                const formattedMovesData =
    manualMovesData.map(
        move => ({

            Postcode:
                move.postcode,

            Move_From:
                move.originalRoute,

            Move_To:
                move.finalRoute,

            Parcels:
                move.parcels || 0,

            JDW_Numbers:
                Array.isArray(
                    move.jdwNumbers
                )

                ? move.jdwNumbers.join(", ")

                : "",

            Moved_At:
                move.movedAt
        })
    );

            const movesSheet =
    XLSX.utils.json_to_sheet(
        formattedMovesData
    );

            XLSX.utils.book_append_sheet(
                workbook,
                movesSheet,
                "Manual_Moves"
            );
        }

        XLSX.writeFile(
            workbook,
            "Optimized_Routes.xlsx"
        );

    } catch (err) {

        console.error(err);

        alert(
            "Export failed."
        );
    }
}
// ======================================
// SAVE SESSION
// ======================================
// SAVE SESSION
// ======================================

function saveCurrentSession() {

    if (stopsData.length === 0) {
        alert("No routes loaded.");
        return;
    }

    const sessionName = prompt("Enter session name");
    if (!sessionName) return;

    saveSessionCloud(
        sessionName,
        currentDepot.id,
        stopsData,
        movedStops,
        hiddenRoutes
    ).then(() => {
        renderSavedSessions();
        alert("Session saved.");
    }).catch(err => {
        console.error(err);
        alert("Error saving session.");
    });
}

// ======================================
// RENDER SAVED SESSIONS
// ======================================

async function renderSavedSessions() {

    savedSessionsContainer.innerHTML =
        '<div style="color:gray;font-size:14px;">Loading...</div>';

    try {
        const sessions = await getSessionsCloud();

        savedSessionsContainer.innerHTML = '';

        if (sessions.length === 0) {
            savedSessionsContainer.innerHTML =
                '<div style="color:gray;font-size:14px;">No saved sessions</div>';
            return;
        }

        sessions.forEach(session => {

            const div = document.createElement('div');
            div.style.background = 'white';
            div.style.padding = '12px';
            div.style.borderRadius = '10px';
            div.style.marginBottom = '10px';
            div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)';

            div.innerHTML = `
                <div style="font-weight:bold;margin-bottom:6px;">
                    ${session.name}
                </div>
                <div style="font-size:13px;color:gray;margin-bottom:10px;">
                    ${new Date(session.created_at).toLocaleString()}
                </div>
                <button onclick="loadSession('${session.id}')"
                    style="margin-right:6px;background:#2563eb;">
                    Load
                </button>
                <button onclick="deleteSession('${session.id}')"
                    style="background:#dc2626;">
                    Delete
                </button>
            `;

            savedSessionsContainer.appendChild(div);
        });

    } catch (err) {
        savedSessionsContainer.innerHTML =
            '<div style="color:red;font-size:14px;">Error loading sessions.</div>';
    }
}

// ======================================
// LOAD SESSION
// ======================================

window.loadSession = async function(sessionId) {

    try {
        const sessions = await getSessionsCloud();
        const session = sessions.find(x => x.id === sessionId);
        if (!session) return;

        currentDepot = DEPOTS[session.depot_config];
        depotSelector.value = session.depot_config;

        stopsData = session.stops;
        routeCache = {};
        movedStops = session.moved_stops || {};
        hiddenRoutes = session.hidden_routes || [];

        await renderMap();
        renderSidebar();

    } catch (err) {
        console.error(err);
        alert("Error loading session.");
    }
};

// ======================================
// DELETE SESSION
// ======================================

window.deleteSession = async function(sessionId) {

    if (!confirm('Delete this session?')) return;

    try {
        await deleteSessionCloud(sessionId);
        renderSavedSessions();
    } catch (err) {
        console.error(err);
        alert("Error deleting session.");
    }
};

// ======================================
// TOGGLE ROUTE VISIBILITY
// ======================================

window.toggleRoute =
function(route) {

    route =
        normalizeRouteName(route);

    const isHidden =
        hiddenRoutes.includes(route);

    if (isHidden) {

        hiddenRoutes =
            hiddenRoutes.filter(
                x => x !== route
            );

    } else {

        hiddenRoutes.push(route);
    }

    markers.forEach(marker => {

        if (
            marker.routeName === route
        ) {

            if (isHidden) {

                map.addLayer(marker);

            } else {

                map.removeLayer(marker);
            }
        }
    });

    if (routeLayers[route]) {

    if (isHidden) {

        if (
            !map.hasLayer(
                routeLayers[route]
            )
        ) {

            routeLayers[
                route
            ].addTo(map);
        }

    } else {

        if (
            map.hasLayer(
                routeLayers[route]
            )
        ) {

            map.removeLayer(
                routeLayers[route]
            );
        }
    }
}
 renderSidebar();
}
map.on(
    'mousedown',
    function(e) {

        console.log("mousedown");
        if (!e.originalEvent.shiftKey)
            return;
        console.log("SHIFT");

        isSelecting = true;

        selectionStart = e.latlng;

        if (selectionRectangle) {

            map.removeLayer(
                selectionRectangle
            );
        }

        selectionRectangle =
            L.rectangle(
                [
                    selectionStart,
                    selectionStart
                ],
                {
                    color: '#2563eb',
                    weight: 2
                }
            ).addTo(map);

    }
);
map.on(
    'mousemove',
    function(e) {
        

        if (
            !isSelecting ||
            !selectionRectangle
        ) {
            return;
        }

        selectionRectangle.setBounds(
            L.latLngBounds(
                selectionStart,
                e.latlng
            )
        );

    }
);
map.on(
    'mouseup',
    function() {
console.log("mouseup");

if (
    !isSelecting ||
    !selectionRectangle
) {
    return;
}

isSelecting = false;

selectedStops = [];

const bounds =
    selectionRectangle.getBounds();

markers.forEach(
    marker => {

        if (
            !marker.stopData
        ) {
            return;
        }

        if (
            bounds.contains(
                marker.getLatLng()
            )
        ) {

            selectedStops.push(
                marker.stopId
            );

            console.log(
                marker.stopData.postcode
            );
        }

    }
);

console.log(
    "Selected:",
    selectedStops.length
);

document.getElementById(
    "multiSelectBar"
).style.display = "flex";

document.getElementById(
    "selectedCount"
).innerText =
    `Selected: ${selectedStops.length}`;
const moveToRoute =
    document.getElementById(
        "moveToRoute"
    );

moveToRoute.innerHTML = "";

getSidebarRoutes()
    .forEach(
        route => {

            moveToRoute.innerHTML += `
                <option value="${route}">
                    ${route}
                </option>
            `;
        }
    );
renderMap();
// Șterge dreptunghiul după selecție
setTimeout(
    () => {

        if (
            selectionRectangle
        ) {

            map.removeLayer(
                selectionRectangle
            );

            selectionRectangle =
                null;
        }

    },
    100
);
}
);
   window.clearSelection =
function() {

    selectedStops = [];

    if (
        selectionRectangle
    ) {

        map.removeLayer(
            selectionRectangle
        );

        selectionRectangle =
            null;
    }

    isSelecting = false;

    selectionStart = null;

    document.getElementById(
        "multiSelectBar"
    ).style.display =
        "none";

    renderMap();
}
window.moveSelectedStops =
async function() {

    const newRoute =
        document.getElementById(
            "moveToRoute"
        ).value;

    const position =
        document.getElementById(
            "movePosition"
        ).value;


    const selectedRouteStops =
        stopsData.filter(
            stop =>
                selectedStops.includes(
                    stop.id
                )
        );

    selectedRouteStops.forEach(stop => {

    const oldRoute = stop.route;

    stop.route = newRoute;

    stop.color =
        ROUTE_COLORS[newRoute] || "gray";

    if (oldRoute !== newRoute) {

        if (movedStops[stop.postcode]) {

            movedStops[stop.postcode].finalRoute =
                newRoute;

            movedStops[stop.postcode].movedAt =
                new Date().toLocaleString();

        } else {

            movedStops[stop.postcode] = {

                postcode: stop.postcode,

                originalRoute: oldRoute,

                finalRoute: newRoute,

                parcels: stop.parcels || 0,

                jdwNumbers: stop.jdwNumbers || [],

                movedAt: new Date().toLocaleString()
            };
        }
    }

});


    const remainingStops =
        stopsData.filter(
            stop =>
                !selectedStops.includes(
                    stop.id
                )
        );


    const targetRouteStops =
        remainingStops.filter(
            stop =>
                stop.route ===
                newRoute
        );

    const otherStops =
        remainingStops.filter(
            stop =>
                stop.route !==
                newRoute
        );


    if (
        position ===
        "start"
    ) {

        stopsData = [

            ...otherStops,

            ...selectedRouteStops,

            ...targetRouteStops

        ];

    } else {

        stopsData = [

            ...otherStops,

            ...targetRouteStops,

            ...selectedRouteStops

        ];

    }

selectedStops = [];

document.getElementById(
    "multiSelectBar"
).style.display =
    "none";

if (
    selectionRectangle
) {

    map.removeLayer(
        selectionRectangle
    );

    selectionRectangle =
        null;
}

routeCache = {};

routeLayers = {};

await renderMap();

renderSidebar();

}
