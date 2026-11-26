package com.example.flutter_application_1

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Canal de prioridad alta: las notificaciones de portón, visitas y domicilios aparecen
        // en la parte superior de la pantalla y suenan. El servidor envía a este mismo canal.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canal = NotificationChannel("cantaluna_avisos", "Avisos de Cantaluna", NotificationManager.IMPORTANCE_HIGH)
            canal.description = "Portón, visitas, paquetes, domicilios, chat y comunicados"
            getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
        }
    }
}
