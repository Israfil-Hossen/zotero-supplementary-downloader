var SupplementaryDownloader;

function install() {}
function uninstall() {}

async function startup({ id, version, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + "supplementary.js");
  SupplementaryDownloader.init({ id: id, version: version, rootURI: rootURI });
  SupplementaryDownloader.addToAllWindows();
}

function shutdown({ id, version, rootURI }, reason) {
  SupplementaryDownloader.removeFromAllWindows();
  SupplementaryDownloader = undefined;
}

function onMainWindowLoad({ window }) {
  SupplementaryDownloader.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  SupplementaryDownloader.removeFromWindow(window);
}
