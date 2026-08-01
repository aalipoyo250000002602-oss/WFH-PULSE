package com.wfh.pulse;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		// Capacitor serves the app from https://localhost; allow local HTTP API calls in dev.
		if (bridge != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
			bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
		}
	}
}
