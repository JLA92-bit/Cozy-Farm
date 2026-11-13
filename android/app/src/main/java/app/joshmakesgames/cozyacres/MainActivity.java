package app.joshmakesgames.cozyacres;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The web view follows the phone's Font size setting (up to 200% on Samsung), which blew every panel up
        // and cut off names and buttons. The game's layout is sized for 100%, so keep its text at that.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) web.getSettings().setTextZoom(100);
    }
}
