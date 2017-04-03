export function decompress(baseStats, newStats) {
    Object.keys(newStats).forEach(function(id) {
        if (!baseStats[id] || id === 'timestamp') {
            baseStats[id] = newStats[id];
        } else {
            var report = newStats[id];
            Object.keys(report).forEach(function(name) {
                baseStats[id][name] = report[name];
            });
        }
    });
    return baseStats;
}

export function compress(baseStats, newStats) {
    Object.keys(newStats).forEach(function(id) {
        if (!baseStats[id]) {
            return;
        }
        var report = newStats[id];
        Object.keys(report).forEach(function(name) {
            if (report[name] === baseStats[id][name]) {
                delete newStats[id][name];
            }
            delete report.timestamp;
            if (Object.keys(report).length === 0) {
                delete newStats[id];
            }
        });
    });
    // TODO: moving the timestamp to the top-level is not compression but...
    newStats.timestamp = new Date();
    return newStats;
}
