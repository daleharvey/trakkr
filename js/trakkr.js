"use strict";

var DB_NAME = 'idb://trakkr';

var Trakkr = function(callback) {

  var api = {};
  var db;

  var currentRun;
  var watchId;

  function positionReceived(position) {
    var point = {
      timestamp: position.timestamp,
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }
    };
    currentRun.points.push(point);
    db.put(currentRun, function(err, ret) {
      if (!err) {
        currentRun._rev = ret.rev;
      }
    });
  }

  api.start = function(runObj, callback) {

    // Initialise the run object
    runObj.started = new Date().getTime();
    runObj._id = 'run-' + runObj.started;
    runObj.points = [];
    currentRun = runObj;

    // Notify the UI when we have got the first lock and started
    // recording
    var locked = false;
    watchId = navigator.geolocation.watchPosition(function(pos) {
      if (locked) {
        positionReceived(pos);
      } else {
        locked = true;
        db.put(currentRun, function(err, ret) {
          if (!err) {
            currentRun._rev = ret.rev;
            callback(null);
          }
        });
      }
    });
  };

  api.stop = function(callback) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    currentRun.ended = new Date().getTime();
    db.put(currentRun, function() {
      callback(currentRun);
      currentRun = null;
    });
  };

  api.getRuns = function(callback) {
    db.allDocs({descending: true, limit: 10, include_docs: true}, callback);
  };

  api.getRun = function(id, callback) {
    db.get(id, callback);
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

  var base = '//' + document.location.host + document.location.pathname;

  var duration;
  var timeInterval;

  var ids = ['start', 'stop', 'runs', 'run', 'timer',
             'page-home', 'page-runs', 'page-run'];

  var currentPage;

  api.startPressed = function() {
    dom.start.textContent = 'Finding Position';
    dom.start.setAttribute('disabled', true);
    trakkr.start({type: 'run'}, function(err) {
      if (err) {
        dom.start.textContent = 'Start';
        dom.start.removeAttribute('disabled');
        console.error('fuck, couldnt start run');
        return;
      }
      dom.start.textContent = 'Recording';
      dom.stop.removeAttribute('disabled');
      duration = 0;
      timeInterval = setInterval(timeUpdated, 1000);
    });
  };

  api.stopPressed = function() {
    trakkr.stop(function(run) {
      dom.stop.setAttribute('disabled', true);
      dom.start.textContent = 'Start';
      dom.timer.textContent = '00:00:00';
      dom.start.removeAttribute('disabled');
      clearInterval(timeInterval);
      timeInterval = null;
      refreshRuns();
      history.pushState({}, 'View Run', base + 'run/' + run._id);
      urlChanged();
    });
  };

  function init() {
    dom.start.removeAttribute('disabled');
    dom.start.addEventListener('click', api.startPressed);
    dom.stop.addEventListener('click', api.stopPressed);
    refreshRuns();
    urlChanged();
  }

  function timeUpdated() {
    dom.timer.textContent = formatDuration(duration++);
  }

  function urlChanged() {
    var path = document.location.pathname.replace('/trakkr', '');
    if (currentPage) {
      currentPage.style.display = 'none';
      currentPage = null;
    }
    if (path === '/') {
      currentPage = dom.pageHome;
    } else if (path === '/runs/') {
      currentPage = dom.pageRuns;
    } else {
      var run = document.location.pathname.split('/').pop();
      if (/^run/.test(run)) {
        trakkr.getRun(run, function(err, runObj) {
          dom.run.textContent = JSON.stringify(runObj, null, 2);
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
          history.pushState({}, 'View Run', base + 'run/' + row.id);
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
      return '00:' + padLeft(minutes, 2) + ':' + padLeft(seconds, 2);
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
      history.pushState({}, '', base + this.getAttribute('data-href'));
      urlChanged();
    });
  }

  new Trakkr(function(err, _trakkr) {
    trakkr = _trakkr;
    init();
  });

})();