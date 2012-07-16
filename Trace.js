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

	var Inspector = brackets.getModule("LiveDevelopment/Inspector/Inspector");
	var Breakpoint = require("Breakpoint");

	var _lastTrace;
	var _lastEvent;

	function _compareLocations(l1, l2) {
		var r = l1.scriptId !== "undefined" ? l1.scriptId === l2.scriptId : (l1.url && l2.url && l1.url === l2.url);
		r = r && l1.lineNumber === l2.lineNumber && l1.columnNumber === l2.columnNumber;
		return r;
	}

	function _compareCallFrames(cf1, cf2) {
		for (var i = 1; i <= cf1.length; i++) {
			if (cf2.length <= i) return i - 1;
			if (!_compareLocations(cf1[cf1.length - i].location, cf2[cf2.length - i].location)) return i - 1;
		}
		return i;
	}

	function Trace(callFrames) {
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

		// check for a child call frame
		_hasChildCallFrame: function (callFrame) {
			for (var i in this.callFrames) {
				var cf = this.callFrames[i];

			}
		},

		// determine the relationship to another trace
		_relateToTrace: function (trace) {
			if (!trace) return;
			var compare = _compareCallFrames(this.callFrames, trace.callFrames);
			if (compare === 0) return;

			// we are the child of a previous trace
			if (this.callFrames.length > trace.callFrames.length) {
				trace.children.push(this);
				this.parent = trace;
			}

			// we are the next trace of a previous trace's parent
			else if (this.callFrames.length < trace.callFrames.length) {
				this.previous = trace.parent;
				trace.parent.next = this;
				this.parent = this.previous.parent;
				if (this.parent) this.parent.children.push(this);
			}

			// we are the next trace of the previous trace
			else {
				this.previous = trace;
				trace.next = this;
				this.parent = this.previous.parent;
				if (this.parent) this.parent.children.push(this);
			}
		}

	};

	exports.Trace = Trace;
});