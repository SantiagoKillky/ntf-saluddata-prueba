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
  host: 'hostcloudpe.lat',
  user: 'killky_testing',
  password: 'hXMOcawe4OeH8u!l',
  database: 'killky_saluddatav2' 
});

// Cuando un cliente se conecta
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  /**
   * Evento 'join':
   * El cliente envía su información: { user_id, role }
   * Se une a dos salas:
   * - 'user_{user_id}' para notificaciones individuales.
   * - 'role_{role}' para notificaciones por rol.
   * Además, se envía el historial de notificaciones del usuario.
   */
  socket.on('join', (userData) => {
    const { user_id, role } = userData;
    socket.join(`user_${user_id}`);
    socket.join(`role_${role}`);
    console.log(`Usuario ${user_id} (rol: ${role}) se ha unido a sus salas.`);

    // Consulta las notificaciones asociadas a este usuario
    const query = `
      SELECT n.id_notifications, n.message, n.target_type, n.target_role, un.seen, n.created_at, n.updated_at
      FROM notifications n
      INNER JOIN user_notifications un ON n.id_notifications = un.id_notifications
      WHERE un.id_users = ?
      ORDER BY n.created_at DESC
    `;
    pool.query(query, [user_id], (err, results) => {
      if (err) {
        console.error("Error consultando notificaciones:", err);
        return;
      }
      socket.emit('all-notifications', results);
    });
  });

  /**
   * Evento 'send-notification':
   * data debe tener la siguiente estructura:
   * {
   *   target_type: 'user' | 'role' | 'all',
   *   target_id: <ID del usuario o del rol>, // para 'all' puede ser null o ignorado
   *   message: 'Contenido del mensaje'
   * }
   */
  socket.on('send-notification', (data) => {
    if (data.target_type === 'user') {
      // Notificación individual
      const queryNotif = `
        INSERT INTO notifications (message, target_type) VALUES (?, ?)
      `;
      pool.query(queryNotif, [data.message, 'user'], (err, notifResult) => {
        if (err) {
          console.error("Error al insertar notificación individual:", err);
          return;
        }
        const notificationId = notifResult.insertId;
        // Insertar en la tabla de asociación para el usuario destino
        const queryUserNotif = `
          INSERT INTO user_notifications (id_notifications, id_users) VALUES (?, ?)
        `;
        pool.query(queryUserNotif, [notificationId, data.target_id], (err, result) => {
          if (err) {
            console.error("Error al asociar notificación al usuario:", err);
            return;
          }
          // Emitir a la sala del usuario
          io.to(`user_${data.target_id}`).emit('notificacion', {
            id_notifications: notificationId,
            message: data.message,
            target_type: 'user',
            seen: 0,
            created_at: new Date()
          });
        });
      });
    } else if (data.target_type === 'role') {
      // Notificación para un rol
      const queryNotif = `
        INSERT INTO notifications (message, target_type, target_role) VALUES (?, ?, ?)
      `;
      pool.query(queryNotif, [data.message, 'role', data.target_id], (err, notifResult) => {
        if (err) {
          console.error("Error al insertar notificación por rol:", err);
          return;
        }
        const notificationId = notifResult.insertId;
        // Se consultan los usuarios que pertenezcan a ese rol.
        const queryUsers = "SELECT id_users FROM users WHERE idrole = ?";
        pool.query(queryUsers, [data.target_id], (err, users) => {
          if (err) {
            console.error("Error al obtener usuarios para el rol:", err);
            return;
          }
          // Para cada usuario se inserta la asociación
          users.forEach(user => {
            const queryUserNotif = `
              INSERT INTO user_notifications (id_notifications, id_users) VALUES (?, ?)
            `;
            pool.query(queryUserNotif, [notificationId, user.id_users], (err, result) => {
              if (err) {
                console.error("Error asociando notificación a usuario:", err);
              }
            });
          });
          // Emitir la notificación a la sala del rol
          io.to(`role_${data.target_id}`).emit('notificacion', {
            id_notifications: notificationId,
            message: data.message,
            target_type: 'role',
            seen: 0,
            created_at: new Date()
          });
        });
      });
    } else if (data.target_type === 'all') {
      // Notificación para todos los usuarios
      const queryNotif = `
        INSERT INTO notifications (message, target_type) VALUES (?, ?)
      `;
      pool.query(queryNotif, [data.message, 'all'], (err, notifResult) => {
        if (err) {
          console.error("Error al insertar notificación para todos:", err);
          return;
        }
        const notificationId = notifResult.insertId;
        // Se consultan todos los usuarios
        const queryUsers = "SELECT id_users FROM users";
        pool.query(queryUsers, (err, users) => {
          if (err) {
            console.error("Error al obtener todos los usuarios:", err);
            return;
          }
          // Insertar la asociación para cada usuario
          users.forEach(user => {
            const queryUserNotif = `
              INSERT INTO user_notifications (id_notifications, id_users) VALUES (?, ?)
            `;
            pool.query(queryUserNotif, [notificationId, user.id_users], (err, result) => {
              if (err) {
                console.error("Error asociando notificación a usuario:", err);
              }
            });
          });
          // Emitir la notificación a todos los conectados
          io.emit('notificacion', {
            id_notifications: notificationId,
            message: data.message,
            target_type: 'all',
            seen: 0,
            created_at: new Date()
          });
        });
      });
    }
  });

  /**
   * Evento 'notification-viewed':
   * Permite que un usuario marque como vista una notificación.
   * data: { id_notifications, id_users }
   */
  socket.on('notification-viewed', (data) => {
    const query = `
      UPDATE user_notifications 
      SET seen = 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id_notifications = ? AND id_users = ?
    `;
    pool.query(query, [data.id_notifications, data.id_users], (err, results) => {
      if (err) {
        console.error("Error al actualizar la notificación:", err);
        return;
      }
      console.log(`Notificación ${data.id_notifications} marcada como vista para el usuario ${data.id_users}`);
      socket.emit('notification-updated', { id_notifications: data.id_notifications, seen: 1 });
    });
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Iniciar el servidor en el puerto configurado por Railway o 3000 por defecto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});