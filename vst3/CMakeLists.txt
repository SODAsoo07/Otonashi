diff --git a/vst3/CMakeLists.txt b/vst3/CMakeLists.txt
index 94ff3ee..0000000 100644
--- a/vst3/CMakeLists.txt
+++ b/vst3/CMakeLists.txt
@@ -13,8 +13,8 @@ FetchContent_MakeAvailable(juce)
 juce_add_plugin(OtonashiTract
     COMPANY_NAME "Otonashi"
     BUNDLE_ID "com.otonashi.tractvst"
-    PLUGIN_MANUFACTURER_CODE Otnh
-    PLUGIN_CODE OTrc
+    PLUGIN_MANUFACTURER_CODE OTNH
+    PLUGIN_CODE OTRC
     PRODUCT_NAME "OTONASHI Tract"
     FORMATS VST3
     IS_SYNTH FALSE
diff --git a/.github/workflows/windows-vst3-build.yml b/.github/workflows/windows-vst3-build.yml
index d1ffd86..0000000 100644
--- a/.github/workflows/windows-vst3-build.yml
+++ b/.github/workflows/windows-vst3-build.yml
@@ -1,24 +1,37 @@
 name: Build Windows VST3
 
 on:
   workflow_dispatch:
+  push:
+    branches:
+      - codex/vst
 
 jobs:
   build-windows:
     runs-on: windows-latest
     steps:
       - name: Checkout
         uses: actions/checkout@v4
 
       - name: Set up MSVC
         uses: ilammy/msvc-dev-cmd@v1
 
       - name: Configure (CMake)
-        run: cmake -S vst3 -B vst3/build -G "Visual Studio 17 2022" -A x64
+        run: >
+          cmake -S vst3 -B vst3/build
+          -G "Visual Studio 17 2022"
+          -A x64
+          -DCMAKE_VERBOSE_MAKEFILE=ON
 
-      - name: Build (Release)
-        run: cmake --build vst3/build --config Release
+      - name: Build (Release, verbose)
+        run: cmake --build vst3/build --config Release --verbose
+
+      - name: Inspect build output
+        shell: powershell
+        run: |
+          Write-Host "=== vst3/build tree ==="
+          Get-ChildItem -Path vst3/build -Recurse | Select-Object FullName
 
       - name: Upload VST3 Artifact
         uses: actions/upload-artifact@v4
         with:
           name: OtonashiTract-Windows-VST3