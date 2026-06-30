package site.nianxxz.laphiny

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LaphinyBackgroundAgentModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LaphinyBackgroundAgent"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      LaphinyBackgroundAgentService.start(reactContext.applicationContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("LAPHINY_BACKGROUND_AGENT_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      LaphinyBackgroundAgentService.stop(reactContext.applicationContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("LAPHINY_BACKGROUND_AGENT_STOP_FAILED", error)
    }
  }
}
