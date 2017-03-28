import Highcharts from "highcharts";

function doImport(evt) {
    evt.target.disabled = 'm';
    const files = evt.target.files;
    const reader = new FileReader();
    reader.onload = (e) => {
        const thelog = JSON.parse(e.target.result);
        importUpdatesAndStats(thelog);
    };
    reader.readAsText(files[0]);
}

function createContainers(connid) {
    let el;
    const container = document.createElement('div');
    container.style.margin = '10px';

    const url = document.createElement('div');
    container.appendChild(url);

    const configuration = document.createElement('div');
    container.appendChild(configuration);

    // show state transitions, like in https://webrtc.github.io/samples/src/content/peerconnection/states
    const signalingState = document.createElement('div');
    signalingState.id = 'signalingstate_' + connid;
    signalingState.textContent = 'Signaling state:';
    container.appendChild(signalingState);
    const iceConnectionState = document.createElement('div');
    iceConnectionState.id = 'iceconnectionstate_' + connid;
    iceConnectionState.textContent = 'ICE connection state:';
    container.appendChild(iceConnectionState);

    // for ice candidates
    const ice = document.createElement('table');
    ice.className = 'candidatepairtable';
    let head = document.createElement('tr');
    ice.appendChild(head);

    el = document.createElement('td');
    el.innerText = 'Local address';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Local type';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Remote address';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Remote type';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Requests sent';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Responses received';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Requests received';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Responses sent';
    head.appendChild(el);

    el = document.createElement('td');
    el.innerText = 'Active Connection';
    head.appendChild(el);

    container.appendChild(ice);

    const table = document.createElement('table');
    head = document.createElement('tr');
    table.appendChild(head);

    el = document.createElement('th');
    el.innerText = 'connection ' + connid;
    head.appendChild(el);

    el = document.createElement('th');
    head.appendChild(el);

    container.appendChild(table);

    containers[connid] = {
        updateLog: table,
        iceConnectionState: iceConnectionState,
        signalingState: signalingState,
        candidates: ice,
        url: url,
        configuration: configuration
    };

    return container;
}

function processTraceEvent(table, event) {
    const row = document.createElement('tr');
    let el = document.createElement('td');
    el.setAttribute('nowrap', '');
    el.innerText = event.time;
    row.appendChild(el);

    // recreate the HTML of webrtc-internals
    const details = document.createElement('details');
    el = document.createElement('summary');
    el.innerText = event.type;
    details.appendChild(el);

    el = document.createElement('pre');
    el.innerText = event.value;
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
        const parts = event.value.split(',')[2].trim().split(' ');
        if (parts && parts.length >= 9 && parts[7] === 'typ') {
            details.classList.add(parts[8]);
        }
    }
    table.appendChild(row);
}

const graphs = {};
const containers = {};
function importUpdatesAndStats(data) {
    document.getElementById('userAgent').innerText = data.userAgent;

    // FIXME: also display GUM calls (can they be correlated to addStream?)

    // first, display the updateLog
    for (const connid of Object.keys(data.PeerConnections)) {
        let connection = data.PeerConnections[connid];
        const container = createContainers(connid, connection.url);

        containers[connid].url.innerText = connection.url;
        containers[connid].configuration.innerText = 'Configuration: ' + JSON.stringify(connection.rtcConfiguration, null, ' ');

        document.getElementById('tables').appendChild(container);

        connection.updateLog.forEach(function (event) {
            processTraceEvent(containers[connid].updateLog, event);
        });
        connection.updateLog.forEach(function (event) {
            // update state displays
            if (event.type === 'iceConnectionStateChange') {
                containers[connid].iceConnectionState.textContent += ' => ' + event.value;
            }
        });
        connection.updateLog.forEach(function (event) {
            // FIXME: would be cool if a click on this would jump to the table row
            if (event.type === 'signalingStateChange') {
                containers[connid].signalingState.textContent += ' => ' + event.value;
            }
        });
        const stun = {};
        for (const reportname of Object.keys(connection.stats)) {
            if (reportname.indexOf('Conn-') === 0) {
                let t = reportname.split('-');
                const comp = t.pop();
                t = t.join('-');
                if (!stun[t]) stun[t] = {};
                const stats = JSON.parse(connection.stats[reportname].values);
                switch (comp) {
                case 'requestsSent':
                case 'consentRequestsSent':
                case 'responsesSent':
                case 'requestsReceived':
                case 'responsesReceived':
                case 'googLocalAddress':
                case 'googRemoteAddress':
                case 'googLocalCandidateType':
                case 'googRemoteCandidateType':
                case 'googActiveConnection':
                    //console.log(t, comp, connection.stats[reportname]);
                    stun[t][comp] = stats[stats.length - 1];
                    break;
                default:
                    //console.log(reportname, comp, stats);
                }
            }
        }
        console.log(stun);
        for (const t of Object.keys(stun)) {
            console.log(t, stun[t]);
            const row = document.createElement('tr');
            let el;

            el = document.createElement('td');
            el.innerText = stun[t].googLocalAddress;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googLocalCandidateType;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googRemoteAddress;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googRemoteCandidateType;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].requestsSent;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].responsesReceived;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].requestsReceived;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].responsesSent;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googActiveConnection;
            row.appendChild(el);
            /*
            el = document.createElement('td');
            el.innerText = stun[t].consentRequestsSent;
            row.appendChild(el);
            */

            containers[connid].candidates.appendChild(row);
        }
    }

    // then, update the stats displays
    for (const connid of Object.keys(data.PeerConnections)) {
        const connection = data.PeerConnections[connid];
        graphs[connid] = {};
        const reportobj = {};
        for (const reportname of Object.keys(connection.stats)) {
            const t = reportname.split('-');
            const comp = t.pop();

            const stat = t.join('-');
            if (!reportobj.hasOwnProperty(stat)) {
                reportobj[stat] = [];
            }
            reportobj[stat].push([comp, JSON.parse(connection.stats[reportname].values)]);
        }
        for (const reportname of Object.keys(reportobj)) {
            // ignore useless graphs
            if (reportname.indexOf('Cand-') === 0 || reportname.indexOf('Channel') === 0) continue;

            const series = [];
            const reports = reportobj[reportname];
            reports.forEach(function (report) {
                if (typeof(report[1][0]) !== 'number') return;
                if (report[0] === 'bytesReceived' || report[0] === 'bytesSent') return;
                if (report[0] === 'packetsReceived' || report[0] === 'packetsSent') return;
                if (report[0] === 'googCaptureStartNtpTimeMs') return;
                series.push({
                    name: report[0],
                    data: report[1]
                });
            });
            if (series.length > 0) {
                const d = document.createElement('div');
                d.id = 'chart_' + Date.now();
                document.getElementById('container').appendChild(d);
                const graph = new Highcharts.Chart({
                    title: {
                        text: reportname + ' (connection ' + connid + ')'
                    },
                    /*
                    xAxis: {
                        type: 'datetime'
                    },
                    yAxis: {
                        min: 0
                    },
                    */
                    chart: {
                        zoomType: 'x',
                        renderTo: d.id
                    },
                    series: series
                });
                graphs[connid][reportname] = graph;
            }
        }
    }
}

global.doImport = doImport;
