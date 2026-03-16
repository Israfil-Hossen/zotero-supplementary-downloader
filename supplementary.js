SupplementaryDownloader = {
  id: null,
  version: null,
  rootURI: null,
  initialized: false,
  addedElementIDs: [],

  init: function (a) {
    if (this.initialized) return;
    this.id = a.id;
    this.version = a.version;
    this.rootURI = a.rootURI;
    this.initialized = true;
    Zotero.debug("[SupplDL] Initialized v" + a.version);
  },

  addToWindow: function (win) {
    var doc = win.document;

    // Download menu item
    var mi = doc.createXULElement("menuitem");
    mi.id = "suppl-dl-menuitem";
    mi.setAttribute("label", "Download Supplementary Files");
    mi.addEventListener("command", function () {
      SupplementaryDownloader.downloadForSelected();
    });
    var menu = doc.getElementById("zotero-itemmenu");
    if (menu) menu.appendChild(mi);
    this.addedElementIDs.push(mi.id);

    // Set folder menu item (under Tools menu)
    var toolsMenu = doc.getElementById("menu_ToolsPopup");
    if (toolsMenu) {
      var sep = doc.createXULElement("menuseparator");
      sep.id = "suppl-dl-separator";
      toolsMenu.appendChild(sep);
      this.addedElementIDs.push(sep.id);

      var folderMi = doc.createXULElement("menuitem");
      folderMi.id = "suppl-dl-set-folder";
      folderMi.setAttribute("label", "Set Supplementary Files Folder...");
      folderMi.addEventListener("command", function () {
        SupplementaryDownloader.chooseFolder(win);
      });
      toolsMenu.appendChild(folderMi);
      this.addedElementIDs.push(folderMi.id);
    }

    Zotero.debug("[SupplDL] Menu added to window");
  },

  addToAllWindows: function () {
    var wins = Zotero.getMainWindows();
    for (var w of wins) {
      if (!w.ZoteroPane) continue;
      this.addToWindow(w);
    }
  },

  removeFromWindow: function (win) {
    var doc = win.document;
    for (var id of this.addedElementIDs) {
      var el = doc.getElementById(id);
      if (el) el.remove();
    }
  },

  removeFromAllWindows: function () {
    var wins = Zotero.getMainWindows();
    for (var w of wins) {
      if (!w.ZoteroPane) continue;
      this.removeFromWindow(w);
    }
  },

  downloadForSelected: async function () {
    var zp = Zotero.getActiveZoteroPane();
    var items = zp.getSelectedItems();
    if (!items || items.length === 0) {
      var pw = new Zotero.ProgressWindow({ closeOnClick: true });
      pw.changeHeadline("Supplementary Downloader");
      pw.addDescription("No items selected.");
      pw.show();
      pw.startCloseTimer(2000);
      return;
    }

    var pw2 = new Zotero.ProgressWindow({ closeOnClick: false });
    pw2.changeHeadline("Supplementary Downloader");
    pw2.addDescription("Processing " + items.length + " item(s)...");
    pw2.show();

    var total = 0;
    for (var item of items) {
      if (item.isAttachment() || item.isNote()) continue;
      try {
        var c = await this._processItem(item);
        total += c;
      } catch (e) {
        Zotero.debug("[SupplDL] Error: " + e.message);
      }
    }

    pw2.addDescription(
      total > 0
        ? "Done! Downloaded " + total + " supplementary file(s)."
        : "No supplementary files found."
    );
    pw2.startCloseTimer(4000);
  },

  _processItem: async function (item) {
    var url = this._resolveURL(item);
    if (!url) {
      Zotero.debug("[SupplDL] No URL/DOI for item " + item.id);
      return 0;
    }

    Zotero.debug("[SupplDL] Fetching: " + url);
    var html;
    try {
      var r = await Zotero.HTTP.request("GET", url, {
        responseType: "text",
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      html = r.responseText || r.response;
    } catch (e) {
      Zotero.debug("[SupplDL] Fetch failed: " + e.message);
      return 0;
    }
    if (!html) return 0;

    var links = this._extractLinks(url, html);
    Zotero.debug("[SupplDL] Found " + links.length + " supplementary link(s)");
    if (links.length === 0) return 0;

    var count = 0;
    for (var lk of links) {
      try {
        await this._downloadAndAttach(item, lk);
        count++;
      } catch (e) {
        Zotero.debug("[SupplDL] Download failed: " + lk.url + " - " + e.message);
      }
    }
    return count;
  },

  _resolveURL: function (item) {
    var u = item.getField("url");
    if (u && /^https?:\/\//.test(u)) return u;
    var doi = item.getField("DOI");
    if (doi) {
      doi = doi.replace(/^https?:\/\/doi\.org\//, "").replace(/^doi:\s*/i, "");
      return "https://doi.org/" + encodeURI(doi);
    }
    return null;
  },

  _extractLinks: function (pageUrl, html) {
    var domain = "";
    try {
      domain = new URL(pageUrl).hostname.toLowerCase();
    } catch (e) {
      return [];
    }

    var patterns = [];

    // Elsevier / ScienceDirect
    if (domain.includes("sciencedirect.com") || domain.includes("elsevier.com")) {
      patterns = [
        /href="([^"]*?(?:mmc\d+|suppl)[^"]*?\.\w{2,5})"/gi,
        /href="([^"]*\/mmc\d+[^"]*)"/gi,
        /href="([^"]*appendix[^"]*\.\w{2,5})"/gi,
      ];
    }
    // BMC / BioMed Central / Springer / Nature / SpringerLink
    else if (domain.includes("nature.com") || domain.includes("springer.com") || domain.includes("springerlink.com") || domain.includes("biomedcentral.com")) {
      patterns = [
        // MediaObjects (main pattern for BMC/Springer supplementary files)
        /href="([^"]*MediaObjects\/[^"]*\.\w{2,5})"/gi,
        // static-content.springer.com ESM files
        /href="([^"]*static-content\.springer\.com[^"]*\.\w{2,5})"/gi,
        // MOESM pattern (Nature style)
        /href="([^"]*MOESM\d+[^"]*\.\w{2,5})"/gi,
        // ESM pattern
        /href="([^"]*ESM[_\d][^"]*\.\w{2,5})"/gi,
        // Figshare supplementary files
        /href="([^"]*figshare\.com\/[^"]*(?:download|ndownloader|files)[^"]*)"/gi,
        // "Additional file" or "Supplementary" links
        /href="([^"]*suppl(?:ementary|emental)[^"]*\.\w{2,5})"/gi,
        /href="([^"]*(?:supplementary|additional)[_-]?(?:file|data|info|table|figure)[^"]*\.\w{2,5})"/gi,
        // Direct PDF/file links with article identifier pattern
        /href="([^"]*(?:\/esm\/|\/suppl\/|\/supplement\/)[^"]*\.\w{2,5})"/gi,
      ];
    }
    // Wiley
    else if (domain.includes("wiley.com")) {
      patterns = [
        /href="([^"]*supp?(?:orting|lemental|lementary)?[_-]?(?:info|file|data|material)?[^"]*\.\w{2,5})"/gi,
        /href="([^"]*action\/downloadSupplement[^"]*)"/gi,
      ];
    }
    // PLOS
    else if (domain.includes("plos.org") || domain.includes("plosone.org")) {
      patterns = [
        /href="([^"]*s\d+[_-](?:file|table|text|figure|appendix)[^"]*\.\w{2,5})"/gi,
        /href="([^"]*pone\.s\d+[^"]*\.\w{2,5})"/gi,
      ];
    }
    // PNAS
    else if (domain.includes("pnas.org")) {
      patterns = [
        /href="([^"]*(?:sapp|suppl|pnas\.\d+SI)[^"]*\.\w{2,5})"/gi,
        /href="([^"]*\/doi\/suppl\/[^"]*)"/gi,
      ];
    }
    // Taylor & Francis
    else if (domain.includes("tandfonline.com")) {
      patterns = [
        /href="([^"]*suppl(?:emental|ementary)?[^"]*\.\w{2,5})"/gi,
        /href="([^"]*\/doi\/suppl\/[^"]*)"/gi,
      ];
    }
    // MDPI
    else if (domain.includes("mdpi.com")) {
      patterns = [/href="([^"]*(?:supplementary|s\d+)[^"]*\.\w{2,5})"/gi];
    }
    // ACS Publications
    else if (domain.includes("acs.org")) {
      patterns = [
        /href="([^"]*suppl[^"]*\.\w{2,5})"/gi,
        /href="([^"]*\/doi\/suppl\/[^"]*)"/gi,
      ];
    }
    // Oxford Academic
    else if (domain.includes("oup.com") || domain.includes("academic.oup.com")) {
      patterns = [/href="([^"]*suppl(?:ementary|emental)?[_-]?(?:data|file|material)?[^"]*\.\w{2,5})"/gi];
    }
    // bioRxiv / medRxiv
    else if (domain.includes("biorxiv.org") || domain.includes("medrxiv.org")) {
      patterns = [
        /href="([^"]*\.suppl[^"]*\.\w{2,5})"/gi,
        /href="([^"]*(?:supplementary|supp)[_-]?(?:data|file|material)?[^"]*\.\w{2,5})"/gi,
      ];
    }
    // Science / AAAS
    else if (domain.includes("science.org") || domain.includes("sciencemag.org")) {
      patterns = [
        /href="([^"]*suppl[^"]*\.\w{2,5})"/gi,
        /href="([^"]*\/doi\/suppl\/[^"]*)"/gi,
      ];
    }

    // Generic fallback
    if (patterns.length === 0) {
      patterns = [
        /href="([^"]*suppl(?:ement(?:ary|al)?)?[_-]?(?:data|file|material|info|table|figure)?[^"]*\.\w{2,5})"/gi,
        /href="([^"]*(?:supporting)[_-]?(?:information|file|data|material)[^"]*\.\w{2,5})"/gi,
        /href="([^"]*(?:appendix|additional[_-]?file)[^"]*\.\w{2,5})"/gi,
      ];
    }

    return this._runPatterns(html, pageUrl, patterns);
  },

  _runPatterns: function (html, pageUrl, patterns) {
    var results = [];
    var seen = {};
    var base;
    try {
      base = new URL(pageUrl);
    } catch (e) {
      return results;
    }

    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      p.lastIndex = 0;
      var m;
      while ((m = p.exec(html)) !== null) {
        var h = m[1];
        if (/^(?:javascript|mailto|#)/i.test(h)) continue;
        var fullUrl;
        try {
          fullUrl = new URL(h, base).href;
        } catch (e) {
          continue;
        }
        if (/\.(css|js|ico|svg|gif|woff2?|ttf|eot)$/i.test(fullUrl)) continue;
        if (seen[fullUrl]) continue;
        seen[fullUrl] = true;
        var filename = "supplementary_file";
        try {
          var last = new URL(fullUrl).pathname.split("/").pop();
          if (last && last.indexOf(".") !== -1)
            filename = decodeURIComponent(last);
        } catch (e) {}
        results.push({ url: fullUrl, filename: filename });
      }
    }
    return results;
  },

  _downloadAndAttach: async function (item, link) {
    Zotero.debug("[SupplDL] Downloading: " + link.url);
    var r = await Zotero.HTTP.request("GET", link.url, {
      responseType: "arraybuffer",
      timeout: 60000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!r || r.status < 200 || r.status >= 400) {
      throw new Error("HTTP " + (r ? r.status : "no response"));
    }

    var tmpDir = Zotero.getTempDirectory().path;
    var tmpFile =
      typeof PathUtils !== "undefined" && PathUtils.join
        ? PathUtils.join(tmpDir, link.filename)
        : tmpDir + "/" + link.filename;

    await IOUtils.write(tmpFile, new Uint8Array(r.response));

    var ct = "";
    try {
      ct = r.getResponseHeader("Content-Type") || "";
    } catch (e) {}
    var mimeType = ct.split(";")[0].trim() || this._getMime(link.filename);

    var title = "[Suppl] " + link.filename;
    var attachment = await Zotero.Attachments.importFromFile({
      file: tmpFile,
      parentItemID: item.id,
      title: title,
      contentType: mimeType,
    });
    attachment.addTag("supplementary", 0);
    await attachment.saveTx();

    // Set up colored tag (red) on first use
    await this._ensureColoredTag(item.libraryID);

    // Copy to external folder if configured
    await this._copyToFolder(item, attachment, link.filename);

    Zotero.debug("[SupplDL] Attached: " + title);
    try {
      await IOUtils.remove(tmpFile);
    } catch (e) {}
  },

  _tagColorSet: false,
  _ensureColoredTag: async function (libraryID) {
    if (this._tagColorSet) return;
    try {
      var tagColors = Zotero.Tags.getColors(libraryID);
      var hasColor = false;
      for (var [name] of tagColors) {
        if (name === "supplementary") { hasColor = true; break; }
      }
      if (!hasColor) {
        // Assign red color (#FF6666) at position 0
        await Zotero.Tags.setColor(libraryID, "supplementary", "#FF6666", 0);
        Zotero.debug("[SupplDL] Set 'supplementary' tag color to red");
      }
      this._tagColorSet = true;
    } catch (e) {
      Zotero.debug("[SupplDL] Could not set tag color: " + e.message);
    }
  },

  // ─── Folder management ─────────────────────────────────────────

  chooseFolder: async function (win) {
    try {
      var nsIFilePicker = Ci.nsIFilePicker;
      var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
      fp.init(win, "Choose Supplementary Files Folder", nsIFilePicker.modeGetFolder);
      var result = await new Promise(function (resolve) {
        fp.open(resolve);
      });
      if (result === nsIFilePicker.returnOK) {
        var folderPath = fp.file.path;
        Zotero.Prefs.set("extensions.suppl-dl.folder", folderPath, true);
        var pw = new Zotero.ProgressWindow({ closeOnClick: true });
        pw.changeHeadline("Supplementary Downloader");
        pw.addDescription("Folder set to:\n" + folderPath);
        pw.show();
        pw.startCloseTimer(3000);
        Zotero.debug("[SupplDL] Folder set to: " + folderPath);
      }
    } catch (e) {
      Zotero.debug("[SupplDL] Folder picker error: " + e.message);
    }
  },

  _getSupplFolder: function () {
    try {
      return Zotero.Prefs.get("extensions.suppl-dl.folder", true);
    } catch (e) {
      return null;
    }
  },

  _copyToFolder: async function (item, attachment, filename) {
    var destDir = this._getSupplFolder();
    if (!destDir) return; // No folder set, skip

    try {
      // Create subfolder based on first author + year
      var creators = item.getCreators();
      var year = item.getField("year") || "Unknown";
      var firstAuthor = "Unknown";
      if (creators && creators.length > 0) {
        firstAuthor = creators[0].lastName || creators[0].name || "Unknown";
      }
      // Clean folder name (remove invalid chars)
      var subfolderName = (firstAuthor + " " + year).replace(/[<>:"/\\|?*]/g, "_");

      var subfolderPath;
      if (typeof PathUtils !== "undefined" && PathUtils.join) {
        subfolderPath = PathUtils.join(destDir, subfolderName);
      } else {
        subfolderPath = destDir + "/" + subfolderName;
      }

      // Create subfolder if it doesn't exist
      var exists = false;
      try { exists = await IOUtils.exists(subfolderPath); } catch (e) {}
      if (!exists) {
        await IOUtils.makeDirectory(subfolderPath, { createAncestors: true });
      }

      // Get the attachment file path
      var srcPath = attachment.getFilePath();
      if (!srcPath) return;

      // Copy file to destination
      var destPath;
      if (typeof PathUtils !== "undefined" && PathUtils.join) {
        destPath = PathUtils.join(subfolderPath, filename);
      } else {
        destPath = subfolderPath + "/" + filename;
      }

      var fileData = await IOUtils.read(srcPath);
      await IOUtils.write(destPath, fileData);
      Zotero.debug("[SupplDL] Copied to: " + destPath);
    } catch (e) {
      Zotero.debug("[SupplDL] Copy to folder failed: " + e.message);
    }
  },

  _getMime: function (filename) {
    var ext = (filename.split(".").pop() || "").toLowerCase();
    var mimeMap = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      zip: "application/zip",
      gz: "application/gzip",
      tar: "application/x-tar",
      csv: "text/csv",
      tsv: "text/tab-separated-values",
      txt: "text/plain",
      xml: "application/xml",
      html: "text/html",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      tif: "image/tiff",
      tiff: "image/tiff",
    };
    return mimeMap[ext] || "application/octet-stream";
  },
};
