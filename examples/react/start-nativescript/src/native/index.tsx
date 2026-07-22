import { startNativeScriptApp } from '@tanstack/react-nativescript-router'
import { configureNativeScriptStart } from '@tanstack/react-start/nativescript'
import { getRouter } from '../router'

const router = getRouter()

void startNativeScriptApp({
  router,
  initialize: () => configureNativeScriptStart(),
})
