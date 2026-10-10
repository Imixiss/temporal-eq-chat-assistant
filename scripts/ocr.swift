import Foundation
import Vision
import AppKit

// 用法: swift ocr.swift <图片路径>
// 输出: 每行一条识别结果（按从上到下、从左到右排序），失败输出到 stderr 并以非 0 退出

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write("usage: ocr.swift <image>\n".data(using: .utf8)!)
    exit(2)
}
let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
    exit(1)
}

let req = VNRecognizeTextRequest()
req.recognitionLanguages = ["zh-Hans", "en-US"]
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
    try handler.perform([req])
} catch {
    FileHandle.standardError.write("ocr failed: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
}

struct Line { let y: CGFloat; let x: CGFloat; let text: String }

var lines: [Line] = []
for obs in req.results ?? [] {
    if let cand = obs.topCandidates(1).first {
        // boundingBox 原点在左下角；转成"从上往下"排序键
        lines.append(Line(y: 1 - obs.boundingBox.origin.y, x: obs.boundingBox.origin.x, text: cand.string))
    }
}
// 按行分组：y 接近的视为同一行，行内按 x 排序
let sorted = lines.sorted { (a: Line, b: Line) -> Bool in
    if abs(a.y - b.y) < 0.015 { return a.x < b.x }
    return a.y < b.y
}
for l in sorted {
    print(l.text)
}
