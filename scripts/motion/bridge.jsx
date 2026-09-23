/* Athar local launcher. Prepare the bridge in Athar Motion Design first. */
(function () {
  var workspace = new File($.fileName).parent.parent.parent.fsName;
  var pointer = new File(workspace + "/.athar/motion/last-bridge.txt");
  try {
    if (!pointer.exists) throw Error("Open Athar > Motion design > Connect After Effects and click Prepare bridge first.");
    pointer.encoding = "UTF-8";
    if (!pointer.open("r")) throw Error("Cannot read Athar connection. Prepare the bridge again in Athar.");
    var target = pointer.read().replace(/^\s+|\s+$/g, ""); pointer.close();
    if (target.indexOf(workspace + "/.athar/motion/") !== 0 || !/\/[0-9a-f]{24}\/Athar-After-Effects\.jsx$/.test(target)) throw Error("Invalid Athar connection. Prepare the bridge again in Athar.");
    var script = new File(target);
    if (!script.exists) throw Error("Athar connection file is missing. Prepare the bridge again in Athar.");
    $.evalFile(script);
  } catch (error) { alert("Athar: " + String(error)); }
})();
