/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

define(function (require, exports) {
	'use strict';

	var Inspector = brackets.getModule('LiveDevelopment/Inspector/Inspector');

	var _breakpoints = {};

	var nextNumber = 1;

	var $exports = $(exports);

	function _eachBreakpoint(callback) {
		for (var i in _breakpoints) {
			if (_breakpoints.hasOwnProperty(i)) {
				callback(_breakpoints[i], i);
			}
		}
	}

	// Breakpoints Class
	function Breakpoint(location, condition) {
		this.location = location;
		this.condition = condition;
		this.number = nextNumber++;
		this.active = false;
	}

	// Breakpoints Methods
	Breakpoint.prototype = {

		// set the breakpoint in the Inspector
		set: function () {
			_breakpoints[this.number] = this;
			this.active = true;
			
			var self = this;
			var l = this.location;
			Inspector.Debugger.setBreakpointByUrl(l.lineNumber, l.url, l.urlRegex, l.columnNumber, this.condition,
				function (res) {

				// res = {breakpointId, locations}
				self.id = res.breakpointId;
				self.resolvedLocations = [];
				$(self).triggerHandler('set', [self]);
				self._addResolvedLocations(res.locations);
			});
		},

		// remove the breakpoint in the Inspector
		remove: function () {
			delete _breakpoints[this.number];
			this.active = false;
			
			var self = this;
			Inspector.Debugger.removeBreakpoint(this.id, function () {
				// res = {}
				$(self).triggerHandler('remove', [self]);
				delete self.id;
				delete self.resolvedLocations;
			});
		},

		// toggle the breakpoint
		toggle: function () {
			if (this.active) {
				this.remove();
			} else {
				this.set();
			}
		},

		// matches the breakpoint's type, location, and condition
		matches: function (location, condition) {
			return this.location.url === location.url &&
				this.location.urlRegex === location.urlRegex &&
				this.location.lineNumber === location.lineNumber &&
				this.location.columnNumber === location.columnNumber &&
				this.condition === condition;
		},

		// matches the breakpoint's resolved locations
		matchesResolved: function () {
			return !!this.resolvedLocations.find(function (l) {
				return (l.scriptId === location.scriptId &&
					l.lineNumber === location.lineNumber &&
					l.columnNumber === location.columnNumber);
			});
		},

		// add a resolved location
		_addResolvedLocations: function (locations) {
			var $this = $(this);
			locations.forEach(function (location) {
				if (!this.matchesResolved(location)) {
					this.resolvedLocations.push(location);
					$this.triggerHandler('resolve', [this, location]);
				}
			});
		}
	};

	// Inspector Event: breakpoint resolved
	function _onBreakpointResolved(event, res) {
		// res = {breakpointId, location}
		var breakpoint = findById(res.breakpointId);
		if (breakpoint) {
			breakpoint._addResolvedLocations([res.location]);
		}
	}

	// Inspector connected
	function _onConnect() {
		Inspector.Debugger.enable().done(function () {
			_eachBreakpoint(function (b) {
				if (b.active) {
					b.set();
				}
			});
		});
	}

	// Init
	function init() {
		$(Inspector).on('connect.debugger', _onConnect);
		$(Inspector.Debugger).on('breakpointResolved.debugger', _onBreakpointResolved);
		if (Inspector.connected()) {
			_onConnect();
		}
	}

	// Unload
	function unload() {
		$(Inspector).off('.debugger');
		$(Inspector.Debugger).off('.debugger');
		$exports.off();
	}

	// Find resolved breakpoints
	function findResolved(location) {
		var result = [];
		_eachBreakpoint(function (b) {
			if (b.matchesResolved(location)) {
				result.push(b);
			}
		});
		return result;
	}

	// Find breakpoints
	function find(location, condition) {
		_eachBreakpoint(function (b) {
			if (b.matches(location, condition)) {
				return b;
			}
		});
	}

	function findById(id) {
		_eachBreakpoint(function (b) {
			if (b.id === id) {
				return b;
			}
		});
	}

	exports.init = init;
	exports.unload = unload;
	exports.find = find;
	exports.findResolved = findResolved;
	exports.Breakpoint = Breakpoint;
});
