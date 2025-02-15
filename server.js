// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // En producción, restringe los orígenes permitidos
    methods: ["GET", "POST"]
  }
});

// Configuración de la conexión a MySQL (ajusta según tus credenciales)
const pool = mysql.createPool({
  host: 'saluddata.com',      
  user: 'urswlyl7ilhej',
  password: 'kwcyhkxt4gtg',
  database: 'dbsciqqs8ecauo'
});

// Eventos de Socket.IO
io.on('connection', (socket) => {
  console.log(`Nuevo cliente conectado: ${socket.id}`);

  // Unir al socket a una sala personal (ej: "user_123")
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`Usuario ${userId} se unió a la sala: user_${userId}`);

    // Enviar todas las notificaciones del usuario al conectarse
    const query = "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC";
    pool.query(query, [userId], (err, results) => {
      if (err) {
        console.error("Error al obtener las notificaciones:", err);
        return;
      }
      socket.emit('all-notifications', results);
    });
  });

  // Recibir y almacenar una notificación
  socket.on('new-notification', (data) => {
    // data debe incluir: { user_id, message }
    console.log(`Datos recibidos del cliente ${socket.id}:`, data);

    const query = "INSERT INTO notifications (user_id, message) VALUES (?, ?)";
    pool.query(query, [data.user_id, data.message], (err, results) => {
      if (err) {
        console.error("Error al insertar la notificación:", err);
        return;
      }
      const notification = {
        id: results.insertId,
        message: data.message,
        user_id: data.user_id,
        seen: 0, // 0: no vista
        created_at: new Date()
      };

      // Enviar la notificación solo al usuario correspondiente
      io.to(`user_${data.user_id}`).emit('notificacion', notification);
      console.log("Notificación enviada a la sala:", `user_${data.user_id}`);
    });
  });

  // Marcar notificación como vista
  socket.on('notification-viewed', (data) => {
    // data debe incluir: { notification_id, user_id }
    const query = "UPDATE notifications SET seen = 1 WHERE id = ? AND user_id = ?";
    pool.query(query, [data.notification_id, data.user_id], (err, results) => {
      if (err) {
        console.error("Error al actualizar la notificación:", err);
        return;
      }
      console.log(`Notificación ${data.notification_id} marcada como vista para el usuario ${data.user_id}`);
      socket.emit('notification-updated', { notification_id: data.notification_id, seen: 1 });
    });
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Puerto definido por Railway o 3000 por defecto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
