// ==UserScript==
// @name         TwitchVODEnhancer
// @author       sooqua
// @namespace    https://github.com/sooqua/
// @downloadURL  https://github.com/sooqua/TwitchVODEnhancer/raw/master/TwitchVODEnhancer.user.js
// @version      0.1
// @match        *://*.twitch.tv/videos/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function() {
    'use strict';

    var client_id = 'ENTER_YOUR_CLIENT_ID';
    var canvas_width = 2500;
    var canvas_height = 50;
    var step = 20; // sec.

    var steps_data_mc = [];
    var steps_data_ts = [];
    var canvas_hheight = canvas_height / 2;

    function init() {
        initOn(document);
        var mo = new MutationObserver(function(muts) {
            muts.forEach(function(mut) {
                [].forEach.call(mut.addedNodes, function(node) {
                    if (node instanceof HTMLElement) {
                        initOn(node);
                    }
                });
            });
        });
        mo.observe(document.body, {childList: true, subtree: true});
    }

    async function initOn(base) {
        base = base.querySelector('.js-player-slider');
        if (!base) return;

        var c = document.createElement('canvas');
        c.width = canvas_width;
        c.height = canvas_height;
        c.style.width = '100%';
        c.style.height = '2.6em';
        base.appendChild(c);

        var vid_id = /twitch.tv\/videos\/(\d{9})$/.exec(window.location.href)[1];

        var r = await get('https://api.twitch.tv/kraken/videos/' + vid_id + '?client_id=' + client_id);
        r = JSON.parse(r.responseText);

        var vid_start = new Date(r.recorded_at).getTime();
        var vid_length = r.length * 1000;
        var vid_end = vid_start + vid_length;

        var last_ts = vid_start;
        var last_step_ts = vid_start;
        var step_msg_count = 0;
        while (true) {
            r = await get('https://rechat.twitch.tv/rechat-messages?video_id=v' + vid_id + '&start=' + Math.round(last_ts / 1000));
            r = JSON.parse(r.responseText);
            var msgs = r.data;
            if (msgs.length === 0) {
                if (last_ts >= vid_end)
                    break;
                last_ts = last_ts + 1000;
            }

            for (let i = 0; i < msgs.length; i++) {
                step_msg_count++;
                var msg_ts = msgs[i].attributes.timestamp;
                if ((msg_ts - last_step_ts) / 1000 >= step) {
                    steps_data_ts.push(msg_ts);
                    steps_data_mc.push(step_msg_count);
                    step_msg_count = 0;

                    var steps_data_min = Math.min(...steps_data_mc);
                    var steps_data_max = Math.max(...steps_data_mc);

                    var ctx = c.getContext('2d');
                    var grd = ctx.createLinearGradient(0, canvas_hheight, canvas_width, canvas_hheight);

                    var pos = 0.0000000000000;
                    grd.addColorStop(pos, 'hsl(0, 0%, 0%)');
                    for (let i = 0; i < steps_data_mc.length; i++) {
                        pos = (steps_data_ts[i] - vid_start) / (vid_end - vid_start);
                        var lightness = (((steps_data_mc[i] - steps_data_min) / (steps_data_max - steps_data_min)) || 0) * 100;
                        grd.addColorStop(pos, 'hsl(0, 0%, ' + lightness + '%)');
                    }
                    grd.addColorStop(pos + 0.0000000000001, 'hsl(0, 0%, 0%)');

                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                    ctx.fillStyle = grd;
                    ctx.fillRect(0, 0, canvas_width, canvas_height);

                    last_step_ts = msg_ts;
                }

                if (i === msgs.length - 1) {
                    if (msg_ts === last_ts)
                        msg_ts = msg_ts + 1000;
                    last_ts = msg_ts;
                }
            }
        }
    }

    function get(url) {
        return new Promise(function(resolve) {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: resolve
            });
        });
    }

    GM_addStyle(`
    .player-seek {
        top: 0px !important;
    }

    .js-player-slider > .ui-slider-range {
        background: rgba(169, 145, 212, .5) !important;
        height: 2.6em !important;
        top: 0px !important;
    }

    .js-player-slider:before {
        display: none !important;
    }

    .js-player-slider > .ui-slider-handle {
        width: .1em !important;
        height: 2.6em !important;
        margin-left: 0em !important;
        top: 0em !important;
        border-radius: initial !important;
        -webkit-transition: initial !important;
        transition: initial !important;
    }

    .player-slider--roundhandle .ui-slider-handle:before {
        display: none !important;
    }

    .player-slider__popup-container {
        box-shadow: none !important;
        background: hsla(0,0%,0%,.5) !important;
    }

    .popup-arrow {
        display: none !important;
    }`);

    document.addEventListener("DOMContentLoaded", init);
})();