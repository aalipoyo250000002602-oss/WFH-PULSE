package com.wfh.pulse;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebSettings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		registerPlugin(ReportFilesPlugin.class);
		super.onCreate(savedInstanceState);

		// Capacitor serves the app from https://localhost; allow local HTTP API calls in dev.
		if (bridge != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
			bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
		}
	}

	/** Saves generated reports through Android's document picker without storage permissions. */
	@CapacitorPlugin(name = "ReportFiles")
	public static class ReportFilesPlugin extends Plugin {
		private final AtomicBoolean saving = new AtomicBoolean(false);

		@PluginMethod
		public void saveFile(PluginCall call) {
			String fileName = call.getString("fileName");
			String data = call.getString("data");
			if (fileName == null || fileName.trim().isEmpty() || data == null) {
				call.reject("The report file is missing its name or content.");
				return;
			}
			if (!saving.compareAndSet(false, true)) {
				call.reject("Finish saving the current report before downloading another.");
				return;
			}
			Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
			intent.addCategory(Intent.CATEGORY_OPENABLE);
			intent.setType(call.getString("mimeType", "application/octet-stream"));
			intent.putExtra(Intent.EXTRA_TITLE, fileName);
			try {
				startActivityForResult(call, intent, "reportLocationSelected");
			} catch (Exception error) {
				saving.set(false);
				call.reject("Unable to open the file save dialog.", error);
			}
		}

		@ActivityCallback
		private void reportLocationSelected(PluginCall call, ActivityResult result) {
			if (call == null) {
				saving.set(false);
				return;
			}
			if (result.getResultCode() != Activity.RESULT_OK) {
				saving.set(false);
				JSObject response = new JSObject();
				response.put("cancelled", true);
				call.resolve(response);
				return;
			}
			Intent selection = result.getData();
			if (selection == null || selection.getData() == null) {
				saving.set(false);
				call.reject("No destination was returned for the report.");
				return;
			}
			// File providers can be slow; keep writes off the UI thread.
			getBridge().execute(() -> {
				try {
					byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
					try (OutputStream stream = getContext().getContentResolver()
						.openOutputStream(selection.getData(), "wt")) {
						if (stream == null) throw new IOException("The destination could not be opened.");
						stream.write(bytes);
					}
					JSObject response = new JSObject();
					response.put("cancelled", false);
					call.resolve(response);
				} catch (Exception error) {
					call.reject("Unable to save the report. Choose another folder or check available storage.", error);
				} finally {
					saving.set(false);
				}
			});
		}
	}
}
