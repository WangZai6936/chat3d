; Scenivo keeps the Chat3D 0.2.0 install directory.
; Tauri records the previous install under the product name, so a rename
; would otherwise install beside the signed 0.2.0 app. The executable name
; and bundle id stay chat3d / com.chat3d.app. Do not run the old uninstaller:
; it can delete $APPDATA\com.chat3d.app, which this install still uses.
!define SCENIVO_LEGACY_PRODUCT "Chat3D"

!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\chat3d.exe" scenivo_keep_instdir
  StrCpy $R7 "$LOCALAPPDATA\Scenivo"
  StrCmp $INSTDIR $R7 scenivo_try_legacy 0
  StrCpy $R7 "$PROGRAMFILES64\Scenivo"
  StrCmp $INSTDIR $R7 scenivo_try_legacy 0
  StrCpy $R7 "$PROGRAMFILES\Scenivo"
  StrCmp $INSTDIR $R7 scenivo_try_legacy scenivo_keep_instdir
  scenivo_try_legacy:
  ReadRegStr $R8 SHCTX "Software\chat3d\${SCENIVO_LEGACY_PRODUCT}" ""
  StrCmp $R8 "" scenivo_keep_instdir
  IfFileExists "$R8\chat3d.exe" 0 scenivo_keep_instdir
  StrCpy $INSTDIR $R8
  SetOutPath $INSTDIR
  RMDir "$R7"
  scenivo_keep_instdir:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$DESKTOP\${SCENIVO_LEGACY_PRODUCT}.lnk" 0 scenivo_start_menu
  Delete "$DESKTOP\${SCENIVO_LEGACY_PRODUCT}.lnk"
  CreateShortcut "$DESKTOP\Scenivo.lnk" "$INSTDIR\chat3d.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\Scenivo.lnk"
  scenivo_start_menu:
  IfFileExists "$SMPROGRAMS\${SCENIVO_LEGACY_PRODUCT}.lnk" 0 scenivo_legacy_registry
  Delete "$SMPROGRAMS\${SCENIVO_LEGACY_PRODUCT}.lnk"
  CreateShortcut "$SMPROGRAMS\Scenivo.lnk" "$INSTDIR\chat3d.exe"
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\Scenivo.lnk"
  scenivo_legacy_registry:
  DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${SCENIVO_LEGACY_PRODUCT}"
  DeleteRegKey SHCTX "Software\chat3d\${SCENIVO_LEGACY_PRODUCT}"
!macroend
