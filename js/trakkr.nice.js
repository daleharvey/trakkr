/*global Router: false, Backbone: false */

'use strict';

var DB_NAME = 'trakkr';

function onChange(change) { 
  // :D
  app.page.refresh();
}

var db = new PouchDB(DB_NAME);
db.changes({live: true}).on('change', onChange);

Backbone.View.prototype.close = function(){
  this.remove();
  this.unbind();
  if (this.onClose){
    this.onClose();
  }
}

var app = {};
_(app).extend(Backbone.Events);


app.RunModel = Backbone.Model.extend({

  defaults: {
    _id: null,
    started: null,
    ended: null,
    points: []
  },

  seconds: 0,
  timer: null,

  initialize: function(opts) {
    this.location = opts.location;
    this.location.bind("change", this.updatePosition, this);
    app.trigger('change:runstarted');
  },

  startRun: function() {
    var now = Date.now();
    this.set({
      _id: 'trakkr-' + now,
      started: now
    });
    this.timer = setInterval(this.updateTimer.bind(this), 1000);
  },

  updateTimer: function() {
    this.seconds++;
    this.trigger('change:time', this.seconds);
  },

  updatePosition: function(update) {
    if (!this.timer) {
      this.startRun();
    }
    var arr = this.get('points');
    arr.push(this.location.get('position'));
    this.set({points: arr});
  },

  stop: function() {
    clearInterval(this.timer);
    app.trigger('change:runstopped');
    this.set('ended', Date.now());
    db.put(JSON.parse(JSON.stringify(this)));
    app.currentRun = null;
  }

});


app.LocationProvider = Backbone.Model.extend({

  defaults: {
    // Do we have an active position lock?
    lock: false,
    // Currently active position
    position: null
  },

  initialize: function() {
    navigator.geolocation.watchPosition(this.positionReceived.bind(this),
                                        this.positionError.bind(this));
  },

  positionReceived: function(loc) {
    this.set({
      lock: true,
      position: {
        timestamp: loc.timestamp,
        coords: loc.coords
      }
    });
  },

  positionError: function() {
    this.set(this.defaults);
  }

});


app.ActivitiesView = Backbone.View.extend({

  template:  _.template($("#tpl-activities").html()),
  rowTemplate:  _.template($("#tpl-activity-row").html()),

  initialize: function(opts) {
    this.runs = opts.runs;
  },

  // TODO: I cant figure out how in the hell Backbone.sync can be overriden
  // it keeps on destroying my success callback
  render: function() {
    db.allDocs({include_docs: true}, this.drawActivities.bind(this));
  },

  drawActivities: function(err, resp) {
    if (resp.total_rows === 0) {
      this.el.innerHTML = 'No Rows';
      return ;
    }
    var ul = resp.rows.map(function(row) {
      return this.rowTemplate(row.doc)
    }, this);
    this.el.innerHTML = '<ul id="runs">' + ul.join('') + '</ul>';
  }

});


app.ActivityView = Backbone.View.extend({

  runData: null,
  template: _.template($('#tpl-activity').html()),

  render: function(id) {
    db.get(id, this.renderRun.bind(this));
  },

  events: {
    'click #delete-run': 'deleteRun'
  },

  renderRun: function(err, data) {
    this.runData = data;
    var runStats = totalDistance(data.points);
    var duration = Math.round((data.ended - data.started) / 1000);
    var miles = runStats.distance * 0.62137;
    this.el.innerHTML = this.template({distance: null, time: null, pace: null});
    this.el.innerHTML = this.template({
      distance: miles.toFixed(2),
      time: formatDuration(duration),
      pace: (miles / duration).toFixed(2)
    });

    var map = L.map('map');
    L.tileLayer('http://{s}.tile.cloudmade.com/e3753638d14547d2869865caec6e7c27/997/256/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 18
    }).addTo(map);

    var markers = data.points.map(function(point) {
      return L.marker([point.coords.latitude, point.coords.longitude]);
    });
    var mapLayer = L.layerGroup(markers).addTo(map);
    map.fitBounds(runStats.bounds);
  },

  deleteRun: function() {
    db.remove(this.runData);
    app.navigate('/activities/');
  }

});


app.RecordActivityView = Backbone.View.extend({

  template: _.template($('#tpl-record-activity').html()),

  render: function() {
    this.run.bind('change:time', this.timeUpdated.bind(this), this);
    this.el.innerHTML = this.template();
  },

  initialize: function(opts) {
    this.location = opts.location;
  },

  events: {
    'click #stop': 'stopPressed'
  },

  timeUpdated: function(seconds) {
    this.$el.find('#timer').html(formatDuration(seconds));
  },

  stopPressed: function() {
    app.currentRun.stop();
    app.navigate('/activities/');
  },

  onClose: function() {
    this.run.bind('change:seconds', this.timeUpdated.bind(this), this);
  },

});


app.HomeView = Backbone.View.extend({

  template:  _.template($("#tpl-homepage").html()),

  initialize: function(opts) {
    this.location = opts.location;
    this.location.bind("change", this.render, this);
  },

  render: function() {
    this.el.innerHTML = this.template();
  },

  events: {
    'click #start': 'startPressed'
  },

  onClose: function() {
    this.location.unbind('change', this.render);
  },

  startPressed: function() {
    app.currentRun = new app.RunModel({location: this.location});
    app.page.refresh();
  }

});


app.PageWrapper = (function() {

  var api = {};
  var wrapper = document.getElementById('content');
  var currentView;

  var subViews = {
    'home': new app.HomeView({location: app.location}),
    'activities': new app.ActivitiesView({runs: app.runs}),
    'activity': new app.ActivityView(),
    'record-activity': new app.RecordActivityView({location: app.location})
  };

  window.onpopstate = function() {
    app.router.trigger(document.location.pathname);
  };

  // The pushstate api kinda sucks, override internal links
  document.addEventListener('click', function(e) {
    var href = e.target.getAttribute('href');
    if (e.target.nodeName !== 'A' || /^http(s?)/.test(href)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    app.navigate(href);
  });

  function setView(viewName, args) {
    if (currentView && 'close' in subViews[currentView]) {
      subViews[currentView].close();
    }
    if (viewName === 'home' && app.currentRun) {
      viewName = 'record-activity';
      subViews[viewName].run = app.currentRun;
    }
    currentView = viewName;
    subViews[viewName].render.call(subViews[viewName], args);
    wrapper.appendChild(subViews[viewName].el);
  }

  function visit(viewName, args) {
    if (viewName === currentView) {
      return;
    }
    setView(viewName, args);
  }

  api.bindVisit = function(name) {
    return visit.bind(this, name);
  };

  api.refresh = function() {
    setView(currentView);
  };

  return api;

});

// The first time someone visits this game in a device that supports
// installation, ask if they want to install it.
if (navigator.mozApps && !localStorage.getItem('checkedInstall')) {
  localStorage.setItem('checkedInstall', 'true');

  var request = navigator.mozApps.getSelf();
  request.onsuccess = function() {
    if (!this.result) {
      var install = confirm('Do you want to install Trakkr?');
      if (install) {
        var manifestUrl = location.protocol + "//" + location.host +
          location.pathname + "manifest.webapp";
        navigator.mozApps.install(manifestUrl);
      }
    }
  };
}
