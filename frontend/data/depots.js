// ======================================
// DEPOTS CONFIG
// Editează DOAR acest fișier când
// adaugi un depozit nou.
// (backend/data/depots.json trebuie să aibă exact aceleași depozite)
// ======================================

const ROUTE_COLORS = {
    "Route 1":    "#ef4444",
    "Route 2":    "#3b82f6",
    "Route 3":    "#22c55e",
    "Route 4":    "#f59e0b",
    "Route 5":    "#a855f7",
    "Route 6":    "#92400e",
    "Route 7":    "#06b6d4",
    "Route 8":    "#84cc16",
    "Route 9":    "#ec4899",
    "Route 10":   "#f97316",
    "Route 11":   "#14b8a6",
    "Route 12":   "#eab308",
    "Route 13":   "#6366f1",
    "Route 14":   "#f43f5e",
    "Route 15":   "#7c3aed",
    "Route 16":   "#0ea5e9",
    "Route 17":   "#65a30d",
    "Route 18":   "#d946ef",
    "Route 19":   "#78716c",
    "Route 20":   "#b91c1c",
    "Route 21":   "#0891b2",
    "Route 22":   "#ca8a04",
    "Route 23":   "#4338ca",
    "Route 24":   "#15803d",
    "Route 25":   "#be185d",
    "Unassigned": "gray",
    "Invalid":    "black"
};


const DEPOTS = {

    "LE11": {
        id:       "LE11",
        name:     "Leicester Depot",
        postcode: "LE11 5GX",
        lat:      52.7806,
        lng:      -1.2215,
        routes: {
            "Route 1": ["NG1","NG3","NG5"],
            "Route 2": ["NG6","NG7","NG8"],
            "Route 3": ["CV13","LE2","LE3","LE6","LE9","LE18","LE19"],
            "Route 4": ["LE1","LE4","LE5","LE7","LE8","LE13","LE14","LE15","LE16"],
            "Route 5": ["DE12","LE11","LE12","LE65","LE67"],
            "Route 6": ["DE1","DE3","DE21","DE22","DE23","DE24","DE73","DE74"],
            "Route 7": ["NG2","NG4","NG12"],
            "Route 8": ["NG9","NG10","NG11","NG90"]
        }
    },

    "B66": {
        id:       "B66",
        name:     "Birmingham Depot",
        postcode: "B66 1BT",
        lat:      52.4906,
        lng:      -1.9705,
        routes: {
            "Route 1": ["B23","B24","B35","B42","B43","B44","B46","B72","B73","B74","B75","B76","B77","B78","B79"],
            "Route 2": ["B25","B26","B27","B28","B33","B34","B36","B37","B40","B47","B90","B91","B92","B93","B94","B95"],
            "Route 3": ["B13","B14","B30","B38","B45","B48","B49","B60","B61","B80","B96","B97","B98","B99","B29"],
            "Route 4": ["B17","B20","B21","B31","B32","B62","B63","B64","B65","B66","B67","B68","B69","B70","B71"],
            "Route 5": ["B15","B16","B18","B19","B3","B4","B6"],
            "Route 6": ["B1","B10","B11","B12","B2","B5","B7","B8","B9"]
        }
    },

    "LTN": {
        id:       "LTN",
        name:     "Luton Depot",
        postcode: "LU1 1AA",
        lat:      51.8787,
        lng:      -0.42,
        routes: {
            "Route 1": ["MK1","MK2","MK3","MK4","MK5","MK6","MK8","MK9","MK11","MK12","MK13","MK14","MK15","MK18","MK19"],
            "Route 2": ["MK40","MK41","MK42","MK43","MK44","MK45","MK46","MK16","MK7","MK10","MK17"],
            "Route 3": ["AL4","AL6","AL7","AL8","AL9","AL10","SG1","SG2","SG3","SG4","SG5","SG6","SG7","SG9","SG10","SG11","SG12","SG13","SG14","SG15","SG16"],
            "Route 4": ["LU2","LU3","LU5","LU6","LU7","HP16","HP19","HP20","HP21","HP22","HP23"],
            "Route 5": ["AL1","AL2","AL3","AL5","HP1","HP2","HP3","HP4","HP5","HP6","HP7","LU1","LU4"]
        }
    },

    "CVY": {
        id:       "CVY",
        name:     "Coventry Depot",
        postcode: "CV7 9RE",
        lat:      52.42717,
        lng:      -1.41181,
        routes: {
            "Route 1": ["CV21","CV22","CV23","CV47","LE17","NN11"],
            "Route 2": ["CV1","CV2","CV3"],
            "Route 3": ["CV8","CV31","CV32","CV33","CV34","CV35","CV36","CV37"],
            "Route 4": ["CV4","CV5","CV6","CV7","CV9","CV10","CV11","CV12","LE10"]
        }
    },

    "E16": {
        id:       "E16",
        name:     "Stratford Depot",
        postcode: "E16 4TG",
        lat:      51.5232,
        lng:      0.0001,
        routes: {
            "Route 1": ["E2","E3"],
            "Route 2": ["E1"],
            "Route 3": ["E1W"],
            "Route 4": ["E14"],
            "Route 6": ["E8","E9"],
            "Route 7": ["E16"],
            "Route 8": ["EC1A","EC1M","EC1N","EC1R","EC1V","EC1Y"],
            "Route 9": ["EC2A","EC2M","EC2N","EC2R","EC2V","EC2Y","EC3A","EC3M","EC3N","EC3R","EC3V","EC4A","EC4M","EC4N","EC4R","EC4V","EC4Y"]
        }
    },

    "CAM": {
        id:       "CAM",
        name:     "Cambridge Depot",
        postcode: "CB1 7EB",
        lat:      52.192,
        lng:      0.138,
        routes: {
            "Route 1": ["CB1","CB9","CB10","CB11","CB21"],
            "Route 2": ["CB6","CB23","CB24"],
            "Route 3": ["CB4","CB5","CB7","CB8","CB25"],
            "Route 4": ["CB3"],
            "Route 5": ["CB2","CB22","SG7","SG8","SG9","SG18","SG19"]
        }
    },

    "OXF": {
        id:       "OXF",
        name:     "Oxford Depot",
        postcode: "OX2 0LX",
        lat:      51.7515,
        lng:      -1.2944,
        routes: {
            "Route 1": ["OX1","SN7","OX12","OX13"],
            "Route 2": ["OX2","OX18","OX28","OX29","OX7"],
            "Route 3": ["OX4","OX9","OX39","OX44","OX10","OX11","OX14","OX49"],
            "Route 4": ["OX3","OX33","OX25","OX26","OX27","OX5","OX20"]
        }
    },

    "ROM": {
        id:       "ROM",
        name:     "Romford Depot",
        postcode: "RM13 8JE",
        lat:      51.5212,
        lng:      0.1709,
        routes: {
            "Route 1": ["E20"],
            "Route 2": ["E15"],
            "Route 3": ["E7","E6","E13","E10","E11","E12","E17","E18"],
            "Route 4": ["IG1","IG2","IG3","IG4","IG5","IG6","IG7","IG8","IG9","IG10","IG11"],
            "Route 5": ["RM1","RM2","RM3","RM4","RM5","RM6","RM7","RM8","RM9","RM10","RM11","RM12","RM14"],
            "Route 6": ["RM13","RM15","RM19","RM16","RM17","RM18","RM20","CM11","CM12","CM13","CM14","CM15","SS12","SS14","SS13","SS15","SS16","SS17"]
        }
    }

};

// ======================================
// Populează dropdown-ul
// ======================================

(function populateDepotSelector() {
    var selector = document.getElementById("depotSelector");
    if (!selector) return;
    selector.innerHTML = "";
    for (var id in DEPOTS) {
        var option = document.createElement("option");
        option.value = id;
        option.textContent = DEPOTS[id].name;
        selector.appendChild(option);
    }
})();
