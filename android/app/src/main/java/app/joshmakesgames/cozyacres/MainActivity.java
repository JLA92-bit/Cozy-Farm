package app.joshmakesgames.cozyacres;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The web view follows the phone's Font size setting (up to 200% on Samsung), which blew every panel up and
        // cut off names and buttons. Keep the page at 100%: the game reads the phone's size with the TextZoom plugin
        // and starts its own Text size setting (systems/Access.ts) on Large or Larger, with layouts made for it.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) web.getSettings().setTextZoom(100);
    }
}
