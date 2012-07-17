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

	var _lastTrace;

	var timeout;
	var roots = [];

	function _locationsEqual(l1, l2) {
		var r = l1.scriptId !== "undefined" ? l1.scriptId === l2.scriptId : (l1.url && l2.url && l1.url === l2.url);
		r = r && l1.lineNumber === l2.lineNumber && l1.columnNumber === l2.columnNumber;
		return r;
	}

	function _sharedCallerCount(cf1, cf2) {
		for (var i = 1; i <= cf1.length; i++) {
			if (cf2.length < i) return i - 1;
			if (!_locationsEqual(cf1[cf1.length - i].location, cf2[cf2.length - i].location)) return i - 1;
		}
		return i;
	}

	function Trace(callFrames) {
		var location = callFrames[0].location;
		var url = ScriptAgent.scriptWithId(location.scriptId).url;
		var name = url.replace(/^.*\//, '');
		this.id = this.baseId = name + ":" + (location.lineNumber + 1);

		this.callFrames = callFrames;
		this.date = new Date();
		this.children = [];
		this._relateToTrace(_lastTrace);
		_lastTrace = this;
	}

	Trace.prototype = {
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
			var shared = _sharedCallerCount(this.callFrames, callFrames);
			
			if (shared === callFrames.length - 1) {
				var sourceFunction = callFrames[0].functionName;
				var targetFunction = this.callFrames[this.callFrames.length - callFrames.length].functionName;
				if (sourceFunction === targetFunction) {
					return true;
				}
			}

			return false;
		},

		setEvent: function (event) {
			this.event = event;
			this.id = this.baseId + " (" + event.data.eventName.replace(/^listener:/, '') + ")";
		},

		// check for a child call frame
		_hasChildCallFrame: function (callFrame) {
			for (var i in this.callFrames) {
				var cf = this.callFrames[i];
			}
		},

		// determine the relationship to another trace
		_relateToTrace: function (trace) {
			clearTimeout(timeout);
			var show = function (node, level) {
				var indent = "";
				for (var i = 0; i < level; i++) { indent += "  "; }
				console.log(indent + node.id, node);
				if (node.children) {
					for (var j = 0; j < node.children.length; j++) {
						if (j) { console.log(indent + "  ---"); }
						show(node.children[j], level + 1);
					}
				}
				if (node.next) {
					show(node.next, level);
				}
			};
			timeout = window.setTimeout(function () {
				console.log("---[ roots ]-------------------------------");
				for (var i = 0; i < roots.length; i++) {
					if (i) { console.log("---"); }
					show(roots[i], 0);
				}
				roots = [];
			}, 1000);

			var shared, rel;

			while (trace) {
				shared = _sharedCallerCount(this.callFrames, trace.callFrames);
				
				// No relationship or trace is child of our parent
				if (shared === 0 || shared >= trace.callFrames.length - 1) { break; }
				trace = trace.parent;
			}

			// Caution: if both traces have only one callframe, length will be 0, too
			// They might still be related, though (window.setTimeout)
			if (! trace || (shared === 0 && (this.callFrames.length > 1 || trace.callFrames.length > 1))) {
				console.log(this.id + ' is a root trace', this, trace);
				roots.push(this);
			}
			else if (this.callFrames.length > trace.callFrames.length) {
				console.log(this.id + ' is a child of ' + trace.id, this, trace);
				trace.children.push(this);
				this.parent = trace;
				if (trace.event) { this.setEvent(trace.event); }
			}
			else if (this.callFrames.length === trace.callFrames.length) {
				console.log(this.id + ' is a sibling of ' + trace.id, this, trace);
				if (trace.next) {
					console.log("Uh oh...", trace.next);
				}
				this.previous = trace;
				trace.next = this;
				if (trace.parent) { this.parent = trace.parent; }
				if (trace.event) { this.setEvent(trace.event); }
			}
			else {
				console.error("Should not happen", this, trace);
			}
		}

	};

	exports.Trace = Trace;
});