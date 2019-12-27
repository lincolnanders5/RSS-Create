const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const querystring = require('querystring');
var net = require('net');
var urlencode = require('urlencode');

var PORT = 4000;
/*
	Borrowed code from:
	https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
	Makes empty call to determine public broadcast IP address.
	The IP is neccessary for giving download URLs for each episode.
	Code has been modified for simplicity
*/
var IP_ADDRESS;
function getNetworkIP(callback) {
  var socket = net.createConnection(80, 'www.google.com');
  socket.on('connect', function() {
    callback(undefined, socket.address().address);
    socket.end();
  });
  socket.on('error', (e) => callback(e, 'error'));
}

getNetworkIP(function (error, ip) {
	IP_ADDRESS = ip;
});
/*
	End borrowed code
*/

var item_template = ({ title = "", description = "", link = "", filepath = "", length = "", date = "", name = "", duration_str = "", guid = "" }) => `<item>
			    <title>${title}</title>
				<itunes:title>${title}</itunes:title>
				<itunes:subtitle>${description}</itunes:subtitle>
			    <itunes:summary>${description}</itunes:summary>
			    <description>${description}</description>
			    <link>${link}</link>
				<itunes:episodeType>full</itunes:episodeType>
			    <enclosure url="${filepath}" type="audio/mpeg" length="${length}"></enclosure>
			    <pubDate>${date}</pubDate>
			    <itunes:author>Lincoln Anders</itunes:author>
			    <itunes:duration>${duration_str}</itunes:duration>
			    <itunes:explicit>no</itunes:explicit>
			    <guid isPermaLink="false">${title}/${guid}</guid>
			</item>`;
var get_ep_obj = (full_path) => {
	const { gid, ctimeMs, size } = fs.statSync(full_path);
	const title_parts = full_path.split(".");
	const path_loc = urlencode(full_path);
	const download_link = `http://${IP_ADDRESS}:${PORT}/download/${path_loc}`;
	return {
		title : path.parse(full_path).name,
		link : download_link,
		filepath : download_link,
		length : size,
		duration_str : "00:01",
		date : (new Date(ctimeMs)).toUTCString(),
		guid : gid
	}
}

var rss_template = ({ title = "", link = "", author = "", subtitle = "", description = "", email = "", image_url = "", content_text = "" }) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:sy="http://purl.org/rss/1.0/modules/syndication/" xmlns:admin="http://webns.net/mvcb/" xmlns:atom="http://www.w3.org/2005/Atom/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
	<channel>
		<title>${title}</title>
		<link>${link}</link>
		<language>en-us</language>
		<copyright>Copyright &#xA9; Owner</copyright>
		<itunes:subtitle>${subtitle}</itunes:subtitle>
		<itunes:author>Lincoln Anders</itunes:author>
		<itunes:summary>${subtitle}</itunes:summary>
		<description>${subtitle}</description>
		<itunes:owner>
		    <itunes:name>Lincoln Anders</itunes:name>
		    <itunes:email>contact@lincolnanders.com</itunes:email>
		</itunes:owner>
		<itunes:explicit>no</itunes:explicit>
		<itunes:image href="${image_url}" />
		<itunes:category text="Technology"></itunes:category>
		${content_text}
	</channel>
</rss>`;

var render_feed = (rel_path) => {
	return new Promise((resolve, reject) => {
		var dir_path = path.resolve(rel_path);
		var file_arr = fs.readdirSync(dir_path, { withFileTypes : true });
		var first_file = "";
		var ep_item_arr = file_arr.map(file_lug => {
			if (file_lug.charAt(0) == ".") return "";
			var full_file_path = path.resolve(rel_path, file_lug);

			if (first_file == "") first_file = full_file_path;

			var ep_obj = get_ep_obj(full_file_path);
			var ep_item = item_template(ep_obj);
			return ep_item;
		});
		var ep_item_str = ep_item_arr.join("");
		var safe_stub = path.parse(rel_path).base
		var feed_obj = {
			title : path.parse(rel_path).base,
			link : `http://${IP_ADDRESS}:${PORT}/feed/${safe_stub}`,
			image_url : "http://www.lincolnanders.com/a/podcast.png",
			content_text : ep_item_str,
		}

		if (ep_item_arr) {
			feed_obj.link = `http://${IP_ADDRESS}:${PORT}/feed/`;
		}
		var feed_str = rss_template(feed_obj);
		resolve(feed_str);
	});
}

app.get("/feed/:enc_path", async (req, res) => {
	var dec_dict = querystring.parse(req.params.enc_path, { maxKeys : 0 });
	var url_path = Object.keys(dec_dict)[0];
	var feed_data = await render_feed(url_path);

	var headers = {
		"Content-Type" : "application/rss+xml",
		"X-Robots-Tag" : "none",
		"Last-Modified" : new Date(),
		"Vary" : "Accept-Encoding",
		"Accept-Ranges" : "bytes",
		"Server" : "nginx"
	}
	Object.entries(headers).forEach(([key, value]) => res.set(key, value));
	res.send(feed_data);
});
app.get("/download/:path", async(req, res) => {
	var dec_dict = querystring.parse(req.params.path, { maxKeys : 0 });
	var url_path = Object.keys(dec_dict)[0];
	res.sendFile(url_path);
})

app.listen(PORT, console.log(`Running on port ${PORT}`));
