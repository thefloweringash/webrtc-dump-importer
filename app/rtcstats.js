import Highcharts from "highcharts";

import statsMangler from "./getstats-mangle";
import {decompress as statsDecompressor} from "./getstats-deltacompression";

function importRawRTCStats(data) {
    const baseStats = {};
    const lines = data.split('\n');
    const client = JSON.parse(lines.shift());
    client.peerConnections = {};
    client.getUserMedia = [];
    lines.forEach(function (line) {
        if (line.length) {
            const data = JSON.parse(line);
            /*
             TODO: the upstream projects seem to use this logic, which doesn't match the actual encoding of the timestamps.
             const time = new Date(data.time);
             delete data.time;
             */
            const time = new Date(data.pop());
            switch (data[0]) {
            case 'location':
                client.location = data[2];
                break;
            case 'userfeedback': // TODO: might be renamed
                client.feedback = data[2];
                break;
            case 'getUserMedia':
            case 'getUserMediaOnSuccess':
            case 'getUserMediaOnFailure':
            case 'navigator.mediaDevices.getUserMedia':
            case 'navigator.mediaDevices.getUserMediaOnSuccess':
            case 'navigator.mediaDevices.getUserMediaOnFailure':
                client.getUserMedia.push({
                    time: time,
                    type: data[0],
                    value: data[2]
                });
                break;
            default:
                if (!client.peerConnections[data[1]]) {
                    client.peerConnections[data[1]] = [];
                    baseStats[data[1]] = {};
                }
                if (data[0] === 'getstats') { // delta-compressed
                    data[2] = statsDecompressor(baseStats[data[1]], data[2]);
                    baseStats[data[1]] = JSON.parse(JSON.stringify(data[2]));
                }
                if (data[0] === 'getStats' || data[0] === 'getstats') {
                    data[2] = statsMangler(data[2]);
                    data[0] = 'getStats';
                }
                client.peerConnections[data[1]].push({
                    time: time,
                    type: data[0],
                    value: data[2]
                });
                break;
            }
        }
    });
    return client;
}

function doImport(evt) {
    evt.target.disabled = 'disabled';
    const files = evt.target.files;
    const reader = new FileReader();
    reader.onload = (e) => {
        let thelog;
        if (e.target.result.indexOf('\n') === -1) {
            // old format TODO: when can we kill this?
            thelog = JSON.parse(e.target.result);
        } else {
            thelog = importRawRTCStats(e.target.result);
        }
        importUpdatesAndStats(thelog);
    };
    reader.readAsText(files[0]);
}

function createContainers(connid, url) {
    const container = document.createElement('div');
    container.style.margin = '10px';

    // show state transitions, like in https://webrtc.github.io/samples/src/content/peerconnection/states
    const signalingState = document.createElement('div');
    signalingState.id = 'signalingstate_' + connid;
    signalingState.textContent = 'Signaling state:';
    container.appendChild(signalingState);
    const iceConnectionState = document.createElement('div');
    iceConnectionState.id = 'iceconnectionstate_' + connid;
    iceConnectionState.textContent = 'ICE connection state:';
    container.appendChild(iceConnectionState);

    let head;

    // for ice candidates
    const ice = document.createElement('table');
    ice.className = 'candidatepairtable';
    head = document.createElement('tr');
    ice.appendChild(head);

    [
        'Local address',
        'Local type',
        'Remote address',
        'Remote type',
        'Requests sent',
        'Responses received',
        'Requests received',
        'Responses sent',
        'Active Connection',
    ].forEach((columnName) => {
        const th = document.createElement('th');
        th.innerText = columnName;
        head.appendChild(th);
    });

    container.appendChild(ice);

    const table = document.createElement('table');
    head = document.createElement('tr');
    table.appendChild(head);

    let el;
    el = document.createElement('th');
    el.innerText = 'connection ' + connid;
    head.appendChild(el);

    el = document.createElement('th');
    el.innerText = url;
    head.appendChild(el);

    container.appendChild(table);

    containers[connid] = {
        updateLog: table,
        iceConnectionState: iceConnectionState,
        signalingState: signalingState,
        candidates: ice,
        // url: url, TODO: what is this?
        // configuration: configuration TODO: what is this?
    };

    return container;
}

function processGUM(data) {
    const container = document.createElement('div');
    container.style.margin = '10px';

    const table = document.createElement('table');
    const head = document.createElement('tr');
    table.appendChild(head);

    let el;
    el = document.createElement('th');
    el.innerText = 'getUserMedia';
    head.appendChild(el);

    container.appendChild(table);

    document.getElementById('tables').appendChild(container);
    data.forEach(function (event) {
        processTraceEvent(table, event); // abusing the peerconnection trace event processor...
    });
}

function processTraceEvent(table, event) {
    let el;

    const row = document.createElement('tr');
    el = document.createElement('td');
    el.setAttribute('nowrap', '');
    el.innerText = event.time;
    row.appendChild(el);

    // recreate the HTML of webrtc-internals
    const details = document.createElement('details');
    el = document.createElement('summary');
    el.innerText = event.type;
    details.appendChild(el);

    el = document.createElement('pre');
    if (['createOfferOnSuccess', 'createAnswerOnSuccess', 'setRemoteDescription', 'setLocalDescription'].indexOf(event.type) !== -1) {
        el.innerText = 'SDP ' + event.value.type + ':' + event.value.sdp;
    } else {
        el.innerText = JSON.stringify(event.value, null, ' ');
    }
    details.appendChild(el);

    el = document.createElement('td');
    el.appendChild(details);

    row.appendChild(el);

    // guess what, if the event type contains 'Failure' one could use css to highlight it
    if (event.type.indexOf('Failure') !== -1) {
        row.style.backgroundColor = 'red';
    }
    if (event.type === 'iceConnectionStateChange') {
        switch (event.value) {
        case 'ICEConnectionStateConnected':
        case 'ICEConnectionStateCompleted':
            row.style.backgroundColor = 'green';
            break;
        case 'ICEConnectionStateFailed':
            row.style.backgroundColor = 'red';
            break;
        }
    }

    if (event.type === 'onIceCandidate' || event.type === 'addIceCandidate') {
        if (event.value && event.value.candidate) {
            const parts = event.value.candidate.trim().split(' ');
            if (parts && parts.length >= 9 && parts[7] === 'typ') {
                details.classList.add(parts[8]);
            }
        }
    }
    table.appendChild(row);
}


const graphs = {};
const containers = {};
function processConnections(connectionIds, data) {
    let connid = connectionIds.shift();
    if (!connid) return;
    window.setTimeout(processConnections, 0, connectionIds, data);

    const connection = data.peerConnections[connid];
    const container = createContainers(connid, data.url);
    document.getElementById('tables').appendChild(container);

    for (let i = 0; i < connection.length; i++) {
        if (connection[i].type !== 'getStats' && connection[i].type !== 'getstats') {
            processTraceEvent(containers[connid].updateLog, connection[i]);
        }
    }

    // then, update the stats displays
    const series = {};
    let connectedOrCompleted = false;
    let firstStats;
    let lastStats;
    for (let i = 0; i < connection.length; i++) {
        if (connection[i].type === 'oniceconnectionstatechange' && (connection[i].value === 'connected' || connection[i].value === 'completed')) {
            connectedOrCompleted = true;
        }
        if (connection[i].type === 'getStats' || connection[i].type === 'getstats') {
            const stats = connection[i].value;
            Object.keys(stats).forEach(function (id) {
                if (stats[id].type === 'localcandidate' || stats[id].type === 'remotecandidate') return;
                Object.keys(stats[id]).forEach(function (name) {
                    if (name === 'timestamp') return;
                    //if (name === 'googMinPlayoutDelayMs') stats[id][name] = parseInt(stats[id][name], 10);
                    if (stats[id].type === 'ssrc' && !isNaN(parseInt(stats[id][name], 10))) {
                        stats[id][name] = parseInt(stats[id][name], 10);
                    }
                    if (stats[id].type === 'ssrc' && name === 'ssrc') return; // ignore ssrc on ssrc reports.
                    if (typeof stats[id][name] === 'number') {
                        if (!series[id]) series[id] = {};
                        if (!series[id][name]) series[id][name] = [];
                        series[id][name].push([new Date(connection[i].time).getTime(), stats[id][name]]);
                    }
                });
            });
        }
        if (connection[i].type === 'getStats' || connection[i].type === 'getstats') {
            if (!firstStats && connectedOrCompleted) firstStats = connection[i].value;
            lastStats = connection[i].value;
        }
    }

    const interestingStats = lastStats; // might be last stats which contain more counters
    if (interestingStats) {
        const stunReports = Object.keys(interestingStats)
            .map((reportName) => [reportName, interestingStats[reportName]])
            .filter(([, {type}]) => type === 'candidatepair');

        for (const [reportName, stun] of stunReports) {
            console.log('STUN', reportName, stun);

            const row = document.createElement('tr');
            const {
                localCandidateId, remoteCandidateId,
                requestsSent, requestsReceived, responsesReceived, responsesSent,
                selected,
            } = stun;

            const {
                ipAddress: localAddress,
                candidateType: localType
            } = interestingStats[localCandidateId];

            const {
                ipAddress: remoteAddress,
                candidateType: remoteType
            } = interestingStats[remoteCandidateId];

            [
                localAddress, localType,
                remoteAddress, remoteType,
                requestsSent, requestsReceived, responsesReceived, responsesSent,
                selected
            ].forEach((contents) => {
                const el = document.createElement('td');
                el.innerText = contents;
                row.appendChild(el);
            });

            containers[connid].candidates.appendChild(row);
        }
    }

    graphs[connid] = {};
    for (const reportname of Object.keys(series)) {
        /*
         series.push({
         name: report[0],
         data: report[1]
         });
         */

        const d = document.createElement('div');
        d.id = 'chart_' + Date.now();
        document.getElementById('container').appendChild(d);
        //console.log(reportname, series[reportname]);
        const da = [];
        Object.keys(series[reportname]).forEach(function (name) {
            da.push({
                name: name,
                data: series[reportname][name]
            });
        });
        const graph = new Highcharts.Chart({
            title: {
                text: connid + ' ' + reportname
            },
            xAxis: {
                type: 'datetime'
            },
            /*
             yAxis: {
             min: 0
             },
             */
            chart: {
                zoomType: 'x',
                renderTo: d.id
            },
            series: da
        });
        graphs[connid][reportname] = graph;
    }
}

function importUpdatesAndStats(data) {
    document.getElementById('userAgent').innerText = data.userAgent;
    processGUM(data.getUserMedia);
    window.setTimeout(processConnections, 0, Object.keys(data.peerConnections), data);
}

global.doImport = doImport;
