import {prepareZXingModule, readBarcodes} from "./zxing-reader.js";

prepareZXingModule({
  overrides: {
    locateFile: (path) => new URL(path, import.meta.url).href,
  },
});

export async function readProductCode(pixels) {
  const results = await readBarcodes(pixels, {
    formats: ["EAN8", "EAN13", "UPCA", "ITF", "DataBar", "Code128", "DataMatrix", "QRCode"],
    textMode: "HRI",
    tryHarder: true,
  });
  const codes = new Set();
  for (const {text} of results) {
    if (/^(?:[0-9]{8}|[0-9]{12,14})$/.test(text) || text.startsWith("(01)")) {
      codes.add(text);
    }
  }
  if (codes.size !== 1) throw new Error("Bitte genau einen Produktbarcode nah und scharf fotografieren.");
  return codes.values().next().value;
}
