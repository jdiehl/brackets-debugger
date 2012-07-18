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

/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
	'use strict';

	var Inspector   = brackets.getModule("LiveDevelopment/Inspector/Inspector");
	var ScriptAgent = brackets.getModule("LiveDevelopment/Agents/ScriptAgent");
	
	var Breakpoint = require("Breakpoint");

	var timeout;

	// compare two locations and return true if both are equal
	function _locationsEqual(l1, l2) {
		var r = l1.scriptId !== "undefined" ? l1.scriptId === l2.scriptId : (l1.url && l2.url && l1.url === l2.url);
		r = r && l1.lineNumber === l2.lineNumber && l1.columnNumber === l2.columnNumber;
		return r;
	}

	// compare two call frame arrays and return the number of shared call frames from the top
	function _sharedCallFrameCount(cf1, cf2) {
		for (var i = 1; i <= cf1.length; i++) {
			if (cf2.length < i) return i - 1;
			if (!_locationsEqual(cf1[cf1.length - i].location, cf2[cf2.length - i].location)) return i - 1;
		}
		return i;
	}

	var _lastParent;
	var _rootTraces = [];

	// attach a new trace to the trace and track new root traces
	function _setupTraceTree(trace) {

		// close a function
		if (trace.type === "function.end") {
			_lastParent = _lastParent.parent;
			return;
		}

		// connect the trace to the last parent
		if (_lastParent) {
			_lastParent.children.push(trace);
			trace.parent = _lastParent;
		}

		// track root traces
		if (trace.type === "event" || !_lastParent) {
			_rootTraces.push(trace);
		}

		// make this trace the last parent
		_lastParent = trace;
	}

	function Trace(type, callFrames, event) {
		this.type = type;
		this.callFrames = callFrames;
		this.event = event;
		this.date = new Date();
		this.children = [];

		// compute the location and id of the trace
		this.location = this.callFrames[0].location;
		this.location.url = ScriptAgent.scriptWithId(this.location.scriptId).url;
		var name = this.location.url.replace(/^.*\//, '');
		this.id = name + ":" + (this.location.lineNumber + 1);

		// connect the trace to its siblings
		_setupTraceTree(this);
	}

	Trace.prototype = {
		findParent: function (trace) {
			if (trace.type === event) return trace;

			while (trace) {
				var shared = _sharedCallFrameCount(this.callFrames, trace.callFrames);

				// this trace is not related to the given trace
				if (shared === 0) return undefined;

				// the trace is the parent
				if (shared === trace.callFrames.length) {
					return trace;
				}

				// try the trace's parent
				trace = trace.parent;
			}
		},

		// resolve a single call frame variable scope
		resolveScope: function (scope) {
			var r = $.Deferred();
			if (scope.resolved) {
				r.resolve(scope.resolved);
			} else {
				Inspector.Runtime.getProperties(scope.object.objectId, true, function (res) {
					scope.resolved = {};
					for (var i in res.result) {
						var info = res.result[i];
						scope.resolved[info.name] = info.value;
					}
					r.resolve(scope.resolved);
				});
			}
			return r.promise();
		},

		// resolve an entire call frame
		resolveCallFrame: function (callFrameIndex, scopeFilter) {
			var callFrame = this.callFrames[callFrameIndex];
			var promises = [];
			for (var i in callFrame.scopeChain) {
				var scope = callFrame.scopeChain[i];
				if (scopeFilter && !scopeFilter(scope)) continue;
				promises.push(this.resolveScope(scope));
			}
			return $.when.apply(null, promises);
		},

		childOf: function (callFrames) {
			var shared = _sharedCallFrameCount(this.callFrames, callFrames);
			
			if (shared === callFrames.length - 1) {
				var sourceFunction = callFrames[0].functionName;
				var targetFunction = this.callFrames[this.callFrames.length - callFrames.length].functionName;
				if (sourceFunction === targetFunction) {
					return true;
				}
			}

			return false;
		},

		locationName: function () {
			var script = this.script();
			if (!script) return undefined;
			return script.url.replace(/^.*\//, '') + ":" + (this.location.lineNumber + 1);
		},

		functionName: function () {
			var name = this.callFrames[0].functionName;
			return name.length > 0 ? name : "<anonymous>";
		},

		script: function () {
			return ScriptAgent.scriptWithId(this.location.scriptId);
		},

		// check for a child call frame
		_hasChildCallFrame: function (callFrame) {
			for (var i in this.callFrames) {
				var cf = this.callFrames[i];
			}
		},

	};

	function rootTraces() {
		return _rootTraces;
	}

	exports.Trace = Trace;
	exports.rootTraces = rootTraces;
});