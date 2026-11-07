# Experimental video guide

Use one local clip at a time. Keep the camera still, use good light, include the full body and hands, choose a background that contrasts with clothing, and avoid motion blur. A plain white wall or calibration board is not required.

The current prototype analyzes the paused frame only. It detects model-estimated body landmarks; it does not detect the clubhead or ball, identify the correct swing automatically, or calculate actual club speed, face angle, spin, dynamic lie, shaft stiffness, or swing phase duration. Pose results are experimental and do not change the shortlist.

First analysis downloads the MediaPipe WASM runtime and Lite pose model from their configured public sources. The video itself is handled locally in the browser and is not sent to those servers by this app. The optional model/runtime request does require internet. A no-person or obscured frame may return no reliable landmarks.
