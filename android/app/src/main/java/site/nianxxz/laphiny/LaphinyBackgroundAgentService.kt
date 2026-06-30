package site.nianxxz.laphiny

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class LaphinyBackgroundAgentService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureNotificationChannel()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopForegroundCompat()
    super.onDestroy()
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or immutablePendingIntentFlag()
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Laphiny Agent 正在运行")
      .setContentText("正在保持 Agent 回复任务，完成后会自动停止。")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)

    if (pendingIntent != null) {
      builder.setContentIntent(pendingIntent)
    }

    return builder.build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Agent runtime",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Keeps Laphiny agent replies running while the app is in the background."
    }
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(channel)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun immutablePendingIntentFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
  }

  companion object {
    private const val CHANNEL_ID = "laphiny-agent-runtime"
    private const val NOTIFICATION_ID = 2404

    fun start(context: Context) {
      val intent = Intent(context, LaphinyBackgroundAgentService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, LaphinyBackgroundAgentService::class.java)
      context.stopService(intent)
    }
  }
}
