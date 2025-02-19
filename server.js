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
  host: '127.0.0.1',      
  user: 'root',
  password: 'Santiago30',
  database: 'notificaciones_db'
});

// Al conectar, el cliente envía tanto su id como su rol
// Ejemplo: { user_id: 123, role: 'admin' }
io.on('connection', (socket) => {
    console.log(`Nuevo cliente conectado: ${socket.id}`);
  
    // Evento para unir al socket a las salas de usuario y rol
    socket.on('join', (userData) => {
      const { user_id, role } = userData;
      socket.join(`user_${user_id}`);
      socket.join(`role_${role}`);
      console.log(`Usuario ${user_id} (rol: ${role}) se unió a sus salas.`);
  
      // Consultar todas las notificaciones del usuario (individual y de rol)
      const query = `
        SELECT n.id_notifications, n.message, n.idrole , un.seen, n.created_at 
        FROM notifications n 
        JOIN user_notifications un ON n.id_notifications = un.id_notification 
        WHERE un.user_id = ? 
        ORDER BY n.created_at DESC
      `;
      pool.query(query, [user_id], (err, results) => {
        if (err) {
          console.error("Error al obtener notificaciones:", err);
          return;
        }
        socket.emit('all-notifications', results);
      });
    });
  
    /**
     * Evento para enviar una notificación.
     * data debe tener:
     * - message: El contenido.
     * - target_type: 'user' o 'role'.
     * - target_id: En caso 'user', el id del usuario; en caso 'role', el nombre del rol.
     */
    socket.on('send-notification', (data) => {
      if (data.target_type === 'user') {
        // Notificación individual
        const queryNotif = "INSERT INTO notifications (message) VALUES (?)";
        pool.query(queryNotif, [data.message], (err, notifResult) => {
          if (err) {
            console.error("Error al insertar notificación:", err);
            return;
          }
          const notificationId = notifResult.insertId;
          // Asocia la notificación al usuario
          const queryUserNotif = "INSERT INTO user_notifications (id_notification, user_id) VALUES (?, ?)";
          pool.query(queryUserNotif, [notificationId, data.target_id], (err, userNotifResult) => {
            if (err) {
              console.error("Error al asociar notificación al usuario:", err);
              return;
            }
            // Enviar la notificación al socket del usuario
            io.to(`user_${data.target_id}`).emit('notificacion', { 
              id: notificationId, 
              message: data.message, 
              seen: 0, 
              created_at: new Date() 
            });
          });
        });
      } else if (data.target_type === 'role') {
        // Notificación por rol
        const queryNotif = "INSERT INTO notifications (message, idrole) VALUES (?, ?)";
        pool.query(queryNotif, [data.message, data.target_id], (err, notifResult) => {
          if (err) {
            console.error("Error al insertar notificación:", err);
            return;
          }
          const notificationId = notifResult.insertId;
          // Consultar todos los usuarios que tienen ese rol
          const queryUsers = "SELECT id FROM users WHERE idrole = ?";
          pool.query(queryUsers, [data.target_id], (err, users) => {
            if (err) {
              console.error("Error al obtener usuarios del rol:", err);
              return;
            }
            // Para cada usuario, crear la asociación
            users.forEach(user => {
              const queryUserNotif = "INSERT INTO user_notifications (id_notification, user_id) VALUES (?, ?)";
              pool.query(queryUserNotif, [notificationId, user.id], (err, result) => {
                if (err) {
                  console.error("Error al asociar notificación al usuario:", err);
                }
              });
            });
            // Emitir la notificación a la sala del rol
            io.to(`role_${data.target_id}`).emit('notificacion', { 
              id: notificationId, 
              message: data.message, 
              seen: 0, 
              created_at: new Date() 
            });
          });
        });
      }
    });
  
    // Evento para marcar una notificación como vista (individual)
    socket.on('notification-viewed', (data) => {
      // data: { notification_id, user_id }
      const query = "UPDATE user_notifications SET seen = 1 WHERE id_notification = ? AND user_id = ?";
      pool.query(query, [data.notification_id, data.user_id], (err, results) => {
        if (err) {
          console.error("Error al actualizar notificación:", err);
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
  
  // Puerto
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });