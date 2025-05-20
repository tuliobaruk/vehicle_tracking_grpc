import fs from "fs";
import { XMLParser } from "fast-xml-parser";

export interface Point {
  lat: number;
  lon: number;
  timestamp: number;
}

export function parseGpx(filePath: string): Point[] {
  const xml = fs.readFileSync(filePath, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(xml);
  const trkpts = json.gpx.trk.trkseg.trkpt;
  return trkpts.map((pt: any) => ({
    lat: parseFloat(pt["@_lat"]),
    lon: parseFloat(pt["@_lon"]),
    timestamp: new Date(pt.time).getTime(),
  }));
}
