
apf.webdav.prototype.getProperties = function(sPath, iDepth, callback, oHeaders) {
    function parseItem(oNode, extra) {
        var NS      = apf.webdav.NS,
            sPath   = decodeURIComponent($xmlns(oNode, "href", NS.D)[0].firstChild
                .nodeValue.replace(/[\\\/]+$/, "")),
            sPath = document.location.pathname.replace(/\/$/,"") + sPath
        sName   = sPath.split("/").pop(),
            bHidden = (sName.charAt(0) == ".");

        if (!this.$showHidden && bHidden)
            return "";

        var t, oItem,
            sType  = $xmlns(oNode, "collection", NS.D).length > 0 ? "folder" : "file",
            aCType = $xmlns(oNode, "getcontenttype", NS.D),
            aExec  = $xmlns(oNode, "executable", NS.lp2);
        oItem = this.$fsCache[sPath] = apf.extend(this.$fsCache[sPath] || {}, {
            path        : sPath,
            type        : sType,
            size        : parseInt(sType == "file"
                ? (t = $xmlns(oNode, "getcontentlength", NS.lp1)).length ? t[0].firstChild.nodeValue : 0
                : 0, 10),
            name        : sName,
            contentType : (sType == "file" && aCType.length
                ? aCType[0].firstChild.nodeValue
                : ""),
            creationDate: (t = $xmlns(oNode, "creationdate", NS.lp1)).length ? t[0].firstChild.nodeValue : "",
            lastModified: (t = $xmlns(oNode, "getlastmodified", NS.lp1)).length ? t[0].firstChild.nodeValue : "",
            etag        : (t = $xmlns(oNode, "getetag", NS.lp1)).length ? t[0].firstChild.nodeValue : "",
            lockable    : ($xmlns(oNode, "locktype", NS.D).length > 0),
            executable  : (aExec.length > 0 && aExec[0].firstChild.nodeValue == "T")
        });

        if (extra)
            extra.data = oItem;

        var aXml = ["<" + sType + " path=\"" + apf.escapeXML(sPath) +
            "\" type=\"" + sType + "\" size=\"" + oItem.size + "\" name=\"" +
            apf.escapeXML(oItem.name) + "\" contenttype=\"" + oItem.contentType +
            "\" modifieddate=\"" + oItem.lastModified + "\" creationdate=\"" +
            oItem.creationDate + "\" lockable=\"" + oItem.lockable.toString() +
            "\" hidden=\"" + bHidden.toString() + "\" executable=\"" +
            oItem.executable.toString() + "\""];

        if (this["extra-properties"]) {
            var oNode,
                aNodes = oNode.selectNodes("//a:*"),
                i = 0,
                l = aNodes.length;
            for (; i < l; ++i) {
                oNode = aNodes[i];
                if (oNode.firstChild && oNode.firstChild.nodeValue) {
                    aXml.push(" " + oNode.localName + "=\"" +
                        oNode.firstChild.nodeValue + "\"");
                }
            }
        }

        return oItem.xml = aXml.join("") + "/>";
    }

    function parsePropertyPackets(oXml, state, extra, callback) {
        var status = parseInt(extra.status, 10);
        if (status == 403 || status == 401 || !oXml)
            return callback ? callback.call(this, null, state, extra) : notAuth.call(this);

        if (typeof oXml == "string")
            oXml = apf.getXml(oXml);

        var aResp = $xmlns(oXml, "response", apf.webdav.NS.D);
        var aOut = [];
        if (aResp.length) //we got a valid result set, so assume that any possible AUTH has succeeded
            this.$regVar("authenticated", true);

        var sPath;
        for (var sa = [], data, i = 0, j = aResp.length; i < j; i++) {
            // Exclude requesting URL if it matches node's HREF (same node)
            sPath = decodeURIComponent($xmlns(aResp[i], "href", apf.webdav.NS.D)[0].firstChild.nodeValue);
            sPath = document.location.pathname.replace(/\/$/,"") + sPath
            if (sPath === extra.url)
                continue;

            parseItem.call(this, aResp[i], data = {});
            if (data.data) {
                sa.push({
                    toString: function(){
                        return this.v;
                    },
                    data : data.data,
                    v    : (data.data.type == "file" ? 1 : 0) + "" + data.data.name.toLowerCase()
                });
            }
        }

        sa.sort();

        for (var i = 0, l = sa.length; i < l; i++) {
            aOut.push(sa[i].data.xml);
        }

//        var start = (extra.headers && typeof extra.headers.Depth != "undefined" && extra.headers.Depth == 0) ? 0 : 1;
//        for (var i = start, j = aResp.length; i < j; i++)
//            aOut.push(parseItem.call(this, aResp[i]));

        callback && callback.call(this, "<files>" + aOut.join("") + "</files>", state, extra);
    }

    // Note: caching is being done by an external model
    this.method = "PROPFIND";
    // XXX maybe we want to change this to allow getting selected props
    var xml = '<?xml version="1.0" encoding="utf-8" ?>'
        + '<D:propfind xmlns:D="' + apf.webdav.NS.D + '">'
        +       '<D:allprop />'
        + '</D:propfind>';
    oHeaders = oHeaders || {};
    oHeaders["Depth"] = typeof iDepth != "undefined" ? iDepth : 1

    this.doRequest(parsePropertyPackets, sPath, xml, oHeaders, true, null, callback);
};