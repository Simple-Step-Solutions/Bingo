// PWA Icon Generator for Chamber Bingo
// Run via Photoshop: File > Scripts > Browse > select this file
// Open your source logo file in Photoshop first, then run this script.

var sizes = [192, 512];
var outputFolder = new Folder($.fileName.replace(/[^\\\/]*$/, "") + "public/icons");

if (!outputFolder.exists) {
    outputFolder.create();
}

var sourceDoc = app.activeDocument;

for (var i = 0; i < sizes.length; i++) {
    var size = sizes[i];

    // Duplicate so we don't modify the original
    var copy = sourceDoc.duplicate();
    copy.resizeImage(
        new UnitValue(size, "px"),
        new UnitValue(size, "px"),
        72,
        ResampleMethod.BICUBIC
    );

    // Flatten so Save As works cleanly
    copy.flatten();

    var saveFile = new File(outputFolder.fsName + "/icon-" + size + ".png");
    var opts = new PNGSaveOptions();
    opts.compression = 6;
    copy.saveAs(saveFile, opts, true);
    copy.close(SaveOptions.DONOTSAVECHANGES);

    $.writeln("Saved: " + saveFile.fsName);
}

alert("Done! Icons saved to public/icons/\nicon-192.png and icon-512.png");
