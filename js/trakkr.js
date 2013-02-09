/*globals _:true, Backbone: true */

"use strict";

var DB_NAME = 'trakkr';
var RUN_TEST = true;


function toRad(num) { 
  return num * Math.PI / 180;
}

// http://www.movable-type.co.uk/scripts/latlong.html
function distanceBetweenPoints(p1, p2) {
  var R = 6371; // km
  var dLat = toRad(p2.latitude - p1.latitude);
  var dLon = toRad(p2.longitude - p1.longitude);
  var lat1 = toRad(p1.latitude);
  var lat2 = toRad(p2.latitude);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.sin(dLon/2) * Math.sin(dLon/2) * 
    Math.cos(p1.latitude) * Math.cos(p2.latitude); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function totalDistance(points) { 
  var distance = 0;
  var bounds = null;
  for (var i = 0; i < points.length - 1; i++) { 
    distance += distanceBetweenPoints(points[i].coords, points[i+1].coords);
    if (!bounds) { 
      bounds = [[points[i].coords.latitude, points[i].coords.longitude],
                [points[i+1].coords.latitude, points[i+1].coords.longitude]]
    } else { 
      bounds[0][0] = Math.min(bounds[0][0], points[i].coords.latitude);      
      bounds[0][1] = Math.min(bounds[0][1], points[i].coords.longitude);
      bounds[1][0] = Math.max(bounds[1][0], points[i].coords.latitude);      
      bounds[1][1] = Math.max(bounds[1][1], points[i].coords.longitude);
    }
  }
  return {
    distance: distance,
    bounds: bounds
  };
}

var Trakkr = function(callback) {

  var api = {};
  var db;

  var lastPoint;
  var currentRun; 
  var gpsStatus = false;

  var testInterval;

  _.extend(api, Backbone.Events);

  var watchId = navigator.geolocation
    .watchPosition(positionReceived, positionError);
  
  function setRunStatus(status) {     
    currentRun.status = status;
    api.trigger('activity.update', status);
  }

  function updateGpsStatus(status) { 
    if (status === gpsStatus) return;
    gpsStatus = status;
    api.trigger('gps.update', gpsStatus);
  }

  function positionError() {
    updateGpsStatus(false);
  }
  
  function positionReceived(position) {
    updateGpsStatus(true);
    lastPoint = {
      timestamp: position.timestamp,
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }
    };
    if (currentRun && currentRun.status.msg !== 'stopping') {
      addPoint(lastPoint);
    }
  }

  function addPoint(point) { 
    if (currentRun.status.msg === 'starting') { 
      setRunStatus({msg: 'recording'});
    }
    if (currentRun.status.msg !== 'recording') { 
      return;
    }
    currentRun.data.points.push(lastPoint);
    db.put(currentRun.data, function(err, ret) {
      api.trigger('recordedPoint', point);
      if (!err) {
        currentRun.data._rev = ret.rev;
      }
    });
  }
  
  api.start = function(opts) {
    var now = Date.now();
    currentRun = {
      data: { 
        _id: 'trakkr-' + now,
        type: opts.type,
        started: now,
        points: []
      }
    };
    setRunStatus({msg: 'starting'});
    
    if (RUN_TEST) { 
      testInterval = setInterval(function() { 
        if (!testRun.length) { 
          clearInterval(testInterval);
          return;
        }
        var point = testRun.shift();
        lastPoint = { 
          timestamp: new Date(point.time).getTime(),
          coords: { 
            latitude: point.lat,
            longitude: point.lon
          }
        };
        addPoint(lastPoint);
      }, 2000);
    }
  };
  
  api.stop = function(callback) {
    if (testInterval) { 
      clearInterval(testInterval);
    }
    setRunStatus({msg: 'ending'});
    currentRun.active = false;
    currentRun.data.ended = Date.now();
    db.put(currentRun.data, function() {
      api.trigger('runs.update');
      setRunStatus({msg: 'ended', id: currentRun.data._id});      
      currentRun = null;
    });
  };
  
  api.getRuns = function(callback) {
    db.allDocs({descending: true, limit: 10, include_docs: true}, callback);
  };

  api.getRun = function(id, callback) {
    db.get(id, callback);
  };

  api.deleteRun = function(runObj) { 
    db.remove(runObj);
    api.trigger('runs.update');
  };

  Pouch(DB_NAME, function(err, pouch) {
    if (err) {
      console.error(err);
      return;
    }
    db = pouch;
    callback(null, api);
  });
};

var TrakkrUI = (function() {

  var api = {};
  var trakkr;
  var dom = {};
  var map;
  var mapLayer;

  var duration;
  var timeInterval;

  var ids = ['start', 'stop', 'runs', 'run', 'timer', 'delete-run',
             'run-distance', 'run-pace', 'run-time',
             'page-home', 'page-runs', 'page-run', 'page-activity', 'gps'];

  var currentPage;
  var currentRun;

  function init() {  
    trakkr.on('runs.update', refreshRuns);
    trakkr.on('gps.update', gpsUpdated);
    trakkr.on('activity.update', activityUpdated);
    dom.deleteRun.addEventListener('click', api.deletePressed);
    dom.start.addEventListener('click', api.startPressed);
    dom.stop.addEventListener('click', api.stopPressed);
    dom.start.removeAttribute('disabled');
    refreshRuns();
    urlChanged();

    map = L.map('map');
    L.tileLayer('http://{s}.tile.cloudmade.com/e3753638d14547d2869865caec6e7c27/997/256/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 18
    }).addTo(map);
  }

  api.deletePressed = function() { 
    trakkr.deleteRun(currentRun);
    currentRun = null;
    visit('View Run', '/runs/');
  };

  api.startPressed = function() {
    dom.start.setAttribute('disabled', true);
    trakkr.start({type: 'run'});
    visit('Start Activity', '/activity/');
  };

  api.stopPressed = function() {
    trakkr.stop();
    clearInterval(timeInterval);
    timeInterval = null;
  };
                
  function runEnded(id) { 
    dom.timer.textContent = '00:00:00';
    dom.start.removeAttribute('disabled');
    visit('View Run', '/run/' + id);
  };

  function visit(name, url) {
    history.pushState({}, name, url);
    urlChanged();
  }

  function activityUpdated(status) { 
    console.log('Activity Update:', status);
    switch (status.msg) { 
    case 'recording': 
      startRecording();
      break;
    case 'ended': 
      runEnded(status.id);
      break;
    }
  }

  function startRecording() {
    duration = 0;
    timeInterval = setInterval(timeUpdated, 1000);
  }

  function gpsUpdated(active) { 
    dom.gps.classList[active ? 'add' : 'remove']('active');
    dom.start.classList[active ? 'add' : 'remove']('gpsActive');
  }

  function timeUpdated() {
    dom.timer.textContent = formatDuration(duration++);
  }
  
  function drawRun(runObj) { 
    if (mapLayer) { 
      mapLayer.clearLayers();
    }
    var runStats = totalDistance(runObj.points);
    var markers = runObj.points.map(function(point) { 
      return L.marker([point.coords.latitude, point.coords.longitude]);
    });
    mapLayer = L.layerGroup(markers).addTo(map);  
    map.fitBounds(runStats.bounds);
    var miles = runStats.distance * 0.62137;
    dom.runDistance.innerHTML = miles.toFixed(2) + 'm';
    var duration = Math.round((runObj.ended - runObj.started) / 1000);
    dom.runTime.innerHTML = formatDuration(duration) + 'min';
    dom.runPace.innerHTML = (miles / duration).toFixed(2) + 'min/mi'
  }
 
  function urlChanged() {
    var path = document.location.pathname;
    if (currentPage) {
      currentPage.style.display = 'none';
      currentPage = null;
    }
    if (path === '/') {
      currentPage = dom.pageHome;
    } else if (path === '/runs/') {
      currentPage = dom.pageRuns;
    } else if (path === '/activity/') { 
      currentPage = dom.pageActivity;
    } else {
      var run = document.location.pathname.split('/').pop();
      if (/^trakkr/.test(run)) {
        trakkr.getRun(run, function(err, runObj) {          
          currentRun = runObj;
          drawRun(runObj);
        });
      }
      currentPage = dom.pageRun;
    }
    currentPage.style.display = 'block';
  }

  function refreshRuns() {
    trakkr.getRuns(function(err, runs) {
      var ul = document.createElement('ul');
      if (!runs.rows.length) {
        ul.insertAdjacentHTML('beforeend', '<li class="empty">No Runs? wtf</li>');
      }
      runs.rows.forEach(function(row) {
        var li = document.createElement('li');
        var a = document.createElement('a');

        var date = new Date(row.doc.started);
        var duration = ('ended' in row.doc)
          ? Math.round((row.doc.ended - row.doc.started) / 1000) : 0;

        a.classList.add('run');
        a.innerHTML = '<strong>' + dateFormat(date, 'mmm dd yyyy, HH:MM') +
          '</strong><br />' + formatDuration(duration);
        a.addEventListener('click', function() {
          history.pushState({}, 'View Run', '/run/' + row.id);
          urlChanged();
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      dom.runs.innerHTML = '';
      dom.runs.appendChild(ul);
    });
  }

  function padLeft(num, length) {
    var r = String(num);
    while (r.length < length) {
      r = '0' + r;
    }
    return r;
  }

  function formatDuration(duration) {
    var minutes = Math.floor(duration / 60);
    var seconds = Math.round(duration % 60);
    if (minutes < 60) {
      return padLeft(minutes, 2) + ':' + padLeft(seconds, 2);
    }
    return '';
  }

  function toCamelCase(str) {
    return str.replace(/\-(.)/g, function(str, p1) {
      return p1.toUpperCase();
    });
  }

  ids.forEach(function(name) {
    dom[toCamelCase(name)] = document.getElementById(name);
  });

  var anchors = document.querySelectorAll('[data-href]');
  for (var i = 0; i < anchors.length; ++i) {
    anchors[i].addEventListener('click', function() {
      history.pushState({}, '', '/' + this.getAttribute('data-href'));
      urlChanged();
    });
  }

  new Trakkr(function(err, _trakkr) {
    trakkr = _trakkr;
    init();
  });

})();
