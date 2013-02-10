'use strict';

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