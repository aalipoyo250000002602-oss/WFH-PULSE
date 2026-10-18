import UIKit
import Capacitor

@objc(ReportBridgeViewController)
class ReportBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ReportFilesPlugin())
    }
}

@objc(ReportFilesPlugin)
public class ReportFilesPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "ReportFilesPlugin"
    public let jsName = "ReportFiles"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise)
    ]

    // Retain the call and source until the Files picker has finished copying it.
    private var pendingCall: CAPPluginCall?
    private var exportDirectory: URL?

    @objc func saveFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Finish saving the current report before downloading another.")
                return
            }
            guard let fileName = call.getString("fileName"),
                  !fileName.isEmpty,
                  fileName == (fileName as NSString).lastPathComponent,
                  fileName != ".", fileName != "..",
                  let encoded = call.getString("data") else {
                call.reject("The report file is missing its name or content.")
                return
            }
            guard let controller = self.bridge?.viewController,
                  controller.viewIfLoaded?.window != nil,
                  controller.presentedViewController == nil else {
                call.reject("Close the current dialog and try saving the report again.")
                return
            }
            self.pendingCall = call
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("report-\(UUID().uuidString)", isDirectory: true)
            let file = directory.appendingPathComponent(fileName)
            self.exportDirectory = directory

            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    guard let data = Data(base64Encoded: encoded) else {
                        throw NSError(domain: "ReportFiles", code: 1,
                                      userInfo: [NSLocalizedDescriptionKey: "Invalid report content."])
                    }
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    try data.write(to: file, options: [.atomic, .completeFileProtection])
                    DispatchQueue.main.async {
                        guard controller.presentedViewController == nil,
                              controller.viewIfLoaded?.window != nil else {
                            self.fail("Unable to open Files. Close the current dialog and try again.")
                            return
                        }
                        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                        picker.delegate = self
                        // Explicit Save/Cancel actions also cover dismissal on iPad.
                        picker.isModalInPresentation = true
                        controller.present(picker, animated: true)
                    }
                } catch {
                    DispatchQueue.main.async {
                        self.fail("Unable to prepare the report. Check available storage and try again.")
                    }
                }
            }
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard !urls.isEmpty else {
            fail("No destination was returned for the report.")
            return
        }
        let call = pendingCall
        cleanup()
        call?.resolve(["cancelled": false])
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let call = pendingCall
        cleanup()
        call?.resolve(["cancelled": true])
    }

    private func fail(_ message: String) {
        let call = pendingCall
        cleanup()
        call?.reject(message)
    }

    private func cleanup() {
        if let directory = exportDirectory {
            try? FileManager.default.removeItem(at: directory)
        }
        exportDirectory = nil
        pendingCall = nil
    }
}
