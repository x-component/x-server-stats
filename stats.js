'use strict';
/**
 * Prepars some statistics information about the node.js runtime environment. 
 * It is filled by the middleware log
 * at the end of the request handling.
 */
var x = require('x-common').extend;

var SPAN = 10000; // 10 sec
var SUMMARY_SPAN = 1 * 3600 * 1000;// reset min max every 1 hour

function create(name) {
	
	var M = {
		
		span:SPAN, // sliding window size: 10 sec.
		
		from:null, // begin sliding window (first request begin)
		to:null,   // end of sliding window (last request begin)
		
		summary:{  // aggregate some date per hour: min, max, sum
			span:SUMMARY_SPAN, // reset min max every 1 hour
			since:(Date.now() / SUMMARY_SPAN).toFixed(0) * SUMMARY_SPAN // align to lower bound
		},
		
		requests:{
			set:[], // sliding window of request in span
			duration:0, // total duration of all requests in sliding window
			
			summary:{
				speed:{
				},
				count:{
				},
				duration:{
				}
			}
		},
		
		users:{ // user related stats
			set:{}, // per user id (msisdn) a count for users in sliding window
			
			summary:{
				count:{
				}
			}
		},
		
		minmax:function (topic, v) { // update topic min, max
			var min = topic.min, max = topic.max;
			if (max === void 0 || v > max) topic.max = v;
			if (min === void 0 || v < min) topic.min = v;
		},
		
		sum:function (topic, v) { // update topic sum
			if (topic.sum === void 0) topic.sum = v; else topic.sum += v;
		},
		
		/**
		 * Calculates statistics
		 *
		 * @param r an object with some HTTP request information.
		 */
		request:function (r) {
			if (this.summary.since + this.summary.span <= Date.now()) this.reset();
			
			var requests = this.requests, requests_summary = requests.summary, requests_set = requests.set,
				users = this.users, users_summary = users.summary, users_set = users.set;
			
			// keep extract from request
			r = {begin:r.begin, end:r.end, duration:r.end - r.begin, user:r.user};
			var user = r.user;
			
			// add to sliding window
			this.to = r.begin; // new end of sliding window
			if (!this.from)
				this.from = this.to;
			requests_set.push(r);
			if (user){
				if (users_set[user]) users_set[user] += 1;
				else users_set[user] = 1;
			} // update user set
			requests.duration += r.duration; // add total duration to calc avg lateron
			
			// remove from sliding window
			while (this.to - this.from > this.span) {
				r = requests_set[0];
				user = r.user;
				if (user){
					if (users_set[user]){
						users_set[user] -= 1; // reference counting
						if (0 === users_set[user])  // if last then remove from set and free memory
							delete users_set[user];
					}
				}
				requests.duration -= r.duration; // reduce total
				requests_set.shift(); // remove from sliding window
				this.from = requests_set[0].begin; // new begin of sliding window
			}
			
			var count = requests_set.length; // current count = sliding window size
			this.minmax(requests_summary.count, count);
			this.sum(requests_summary.count, count);
			requests_summary.count.current = count;
			
			var speed = count / (this.span / 1000); // speed is cal. in requests per *second*
			this.minmax(requests_summary.speed, speed);
			requests_summary.speed.current = speed;
			
			this.minmax(requests_summary.duration, requests.duration);
			requests_summary.duration.avg = requests.duration / count; // average in sliding window
			
			this.minmax(users_summary.count, Object.keys(users_set).length);
			this.sum(users_summary.count, count);
		},
		
		reset:function () {
			var requests = this.requests, requests_summary = requests.summary,
				users = this.users, users_summary = users.summary;
			requests_summary.speed = {};
			requests_summary.count = {};
			requests_summary.duration = {};
			users_summary.count = {};
		},
		
		setup:function (server) {
			var stats = name ? '/stats/' + name : '/stats';
			server.get(stats + '/requests/summary', function (req, res) { res.json(M.requests.summary); });
			server.get(stats + '/requests', function (req, res) { res.json(M.requests); });
			server.get(stats + '/users/summary', function (req, res) { res.json(M.users.summary); });
			server.get(stats + '/users', function (req, res) { res.json(M.users); });
			server.get(stats + '/reset', function (req, res) { M.reset(); res.redirect('/stats'); });
			server.get(stats, function (req, res) { res.json(M); });
		}
	};
	
	return M;
}

module.exports = create();
module.exports.create = create; // to allow creating more stats modules (mce)
