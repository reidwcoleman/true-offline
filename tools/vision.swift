// Apple Vision helpers for the True Offline asset pipeline.
//   swift vision.swift mask <in.jpg> <out_mask.png>   foreground mask, full resolution, 8-bit
//   swift vision.swift ocr  <in.jpg>                  JSON array of {t,x,y,w,h} in pixels, y from top
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage"); exit(2) }
let mode = args[1]
let url = URL(fileURLWithPath: args[2])
guard let ci = CIImage(contentsOf: url) else { print("cannot read \(args[2])"); exit(1) }
let ctx = CIContext()
guard let cg = ctx.createCGImage(ci, from: ci.extent) else { exit(1) }

if mode == "mask" {
    let req = VNGenerateForegroundInstanceMaskRequest()
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    try h.perform([req])
    guard let r = req.results?.first else { print("no foreground"); exit(3) }
    let buf = try r.generateScaledMaskForImage(forInstances: r.allInstances, from: h)
    let m = CIImage(cvPixelBuffer: buf)
    let gray = CGColorSpace(name: CGColorSpace.linearGray)!
    try ctx.writePNGRepresentation(of: m, to: URL(fileURLWithPath: args[3]), format: .L8, colorSpace: gray)
} else if mode == "ocr" {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    try h.perform([req])
    let W = Double(cg.width), H = Double(cg.height)
    var out: [[String: Any]] = []
    for o in req.results ?? [] {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        out.append(["t": c.string, "x": b.minX * W, "y": (1 - b.maxY) * H, "w": b.width * W, "h": b.height * H])
    }
    let d = try JSONSerialization.data(withJSONObject: out)
    print(String(data: d, encoding: .utf8)!)
}
