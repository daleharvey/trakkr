/*jshint browser:true */
/*globals _, Backbone */

"use strict";

var app = {};

var Trakkr = function(callback) {

  var DB_NAME = 'trakkr';

  var api = {};
  _.extend(api, Backbone.Events);

  var db = Pouch(DB_NAME, function(err, pouch) {
    callback(err);
  });
  
  var currentRun; 
  var gpsStatus = false;

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
    if (currentRun && currentRun.status.msg !== 'stopping') {
      api.addPoint({
        timestamp: position.timestamp,
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }
      });
    }
  }
  
  api.addPoint = function(point) { 
    if (currentRun.status.msg === 'starting') { 
      setRunStatus({msg: 'recording'});
    }
    if (currentRun.status.msg !== 'recording') { 
      return;
    }
    currentRun.data.points.push(point);
    db.put(currentRun.data, function(err, ret) {
      if (!err) {
        currentRun.data._rev = ret.rev;
      }
    });
  };
  
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
  };
  
  api.stop = function(callback) {
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

  return api;
};

var TrakkrUI = (function() {

  var api = {};

  var trakkr = new Trakkr(function(err) {
    init();
  });
  
  var dom = {};
  var map;
  var mapLayer;

  var duration;
  var timeInterval;

  var ids = ['start', 'stop', 'runs', 'run', 'timer', 'delete-run',
             'run-distance', 'run-pace', 'run-time', 'gps'];
  ids.forEach(function(name) {
    dom[toCamelCase(name)] = document.getElementById(name);
  });

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

    map = L.map('map');
    L.tileLayer('http://{s}.tile.cloudmade.com/e3753638d14547d2869865caec6e7c27/997/256/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 18
    }).addTo(map);
  }

  api.deletePressed = function() { 
    trakkr.deleteRun(currentRun);
    currentRun = null;
    api.navigate('/activities/');
  };

  api.startPressed = function() {
    dom.start.setAttribute('disabled', true);
    trakkr.start({type: 'run'});
    api.navigate('/record-activity/');
  };

  api.stopPressed = function() {
    trakkr.stop();
    clearInterval(timeInterval);
    timeInterval = null;
  };
                
  var testInterval;
  var TEST_RUN = true;

  function runEnded(id) { 
    if (testInterval) { 
      clearInterval(testInterval);
    }
    dom.timer.textContent = '00:00:00';
    dom.start.removeAttribute('disabled');
    api.navigate('/activity/' + id);
  }

  function startingRun() {
    if (!TEST_RUN) return;
    testInterval = setInterval(function() { 
      if (!testRun.length) { 
        clearInterval(testInterval);
        return;
      }
      var point = testRun.shift();
      trakkr.addPoint({ 
        timestamp: new Date(point.time).getTime(),
        coords: { 
          latitude: point.lat,
          longitude: point.lon
        }
      });
    }, 2000);
  }

  function activityUpdated(status) { 
    console.log('Activity Update:', status);
    switch (status.msg) {
      case 'starting': 
        startingRun();      
        break;
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
    var duration = Math.round((runObj.ended - runObj.started) / 1000);

    dom.runDistance.innerHTML = miles.toFixed(2) + 'm';
    dom.runTime.innerHTML = formatDuration(duration) + 'min';
    dom.runPace.innerHTML = (miles / duration).toFixed(2) + 'min/mi'
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
        var duration = ('ended' in row.doc) ? 
          Math.round((row.doc.ended - row.doc.started) / 1000) : 0;

        a.classList.add('run');
        a.innerHTML = '<strong>' + dateFormat(date, 'mmm dd yyyy, HH:MM') +
          '</strong><br />' + formatDuration(duration);
        a.addEventListener('click', function() {
          api.navigate('/activity/' + row.id);
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      dom.runs.innerHTML = '';
      dom.runs.appendChild(ul);
    });
  }

  // The pushstate api kinda sucks, override internal links 
  document.addEventListener('click', function(e) { 
    if (e.target.nodeName !== 'A' || 
        /^http(s?)/.test(e.target.getAttribute('href'))) { 
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    api.navigate(e.target.getAttribute('href'));
  });


  // This all handles page navigation
  var pages = {};

  ['home', 'activities', 'record-activity', 'activity'].forEach(function(page) { 
    pages[page] = {dom: document.getElementById('page-' + page) };
  });

  pages.activity.render = function(id) { 
    trakkr.getRun(id, function(err, runObj) { 
      drawRun(runObj);
    });
  };
  
  api.navigate = function(url, title) { 
    history.pushState({}, title, url);
    app.router.trigger(url);
  };

  api.visit = function(page, args) {    
    if (currentPage) {
      currentPage.style.display = 'none';
      currentPage = null;
    }    
    currentPage = pages[page].dom;
    if (pages[page].render) { 
      pages[page].render.apply(this, args);
    }
    currentPage.style.display = 'block';
  };

  window.onpopstate = function() { 
    api.navigate(document.location.pathname);
  };

  return api;

})();


app.HomeView = function() { 
  
};


app.PageView = function() { 
  
};


// It would be nice to do this binding in a cleaner way, I cant think
// of one right now though
app.router = new Router({
  '/': TrakkrUI.visit.bind(this, 'home'),
  '/record-activity/': TrakkrUI.visit.bind(this, 'record-activity'),
  '/activity/:id': function(id) { TrakkrUI.visit('activity', [id])},
  '/activities/': TrakkrUI.visit.bind(this, 'activities')
});

app.router.trigger('/');


// The first time someone visits this game in a device that supports
// installation, ask if they want to install it.
if (navigator.mozApps && !localStorage.getItem('checkedInstall')) {
  localStorage.setItem('checkedInstall', 'true');

  var request = navigator.mozApps.getSelf();
  request.onsuccess = function() {
    if (!this.result) {
      var install = confirm('Do you want to install Trackkr?');
      if (install) {
        var manifestUrl = location.protocol + "//" + location.host + 
          location.pathname + "manifest.webapp";
        navigator.mozApps.install(manifestUrl);
      }
    }
  };
}