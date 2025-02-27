// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const relativeTime = require('dayjs/plugin/relativeTime');

// Importa la localización en español
require('dayjs/locale/es');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('es');

// Middleware para parsear JSON en las peticiones
app.use(express.json());

// URL de la API externa que maneja el CRUD de notificaciones
const externalAPI = 'https://dev.hostcloudpe.lat/adminkillky/v3/module/notifications/controller/notifications.controller.php';

/**
 * Endpoint HTTP que actúa como proxy para la API externa.
 */
app.post('/notifications', async (req, res) => {
  try {
    const response = await axios.post(externalAPI, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error en /notifications:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud de notificaciones' });
  }
});

/**
 * Función helper para obtener las notificaciones de un proyecto y usuario.
 */
async function getNotifications({ idproject, user_id, seen = 0 }) {
  try {
    const response = await axios.post(externalAPI, {
      mode: 'select_all_notifications_project',
      seen,
      user_id,
      idproject
    }, { headers: { 'Content-Type': 'application/json' }});

    const notifications = response.data.notifications.data.map(notification => ({
      ...notification,
      created_at: dayjs
        .tz(notification.created_at, "YYYY-MM-DD HH:mm:ss", "America/Lima")
        .fromNow()
    }));

    return notifications;
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    return [];
  }
}

/**
 * Socket.IO: Manejo de la comunicación en tiempo real.
 */
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  /**
   * Evento 'join':
   * El cliente se une a las salas de proyecto y usuario.
   * Luego se obtiene y emite el historial de notificaciones.
   */
  socket.on('join', async (data) => {
    const { idproject, user_id } = data;
    socket.join(`project_${idproject}`);
    socket.join(`user_${user_id}`);
    console.log(`Usuario ${user_id} se unió al proyecto ${idproject}.`);

    const notifications = await getNotifications({ idproject, user_id });
    io.to(`user_${user_id}`).emit('all-notifications', notifications);
    console.log(`Notificaciones enviadas a usuario ${user_id}: ${JSON.stringify(notifications)}`);
  });

  /**
   * Evento 'notification-viewed':
   * Se espera recibir { idnotifications, user_id, idproject }.
   * Se marca la notificación como vista y se envía la lista actualizada.
   */
  socket.on('notification-viewed', async (data) => {
    const { iduser_notifications, idnotifications, user_id, idproject } = data;
    try {
      await axios.post(
        'https://dev.hostcloudpe.lat/adminkillky/v3/module/users_notifications/controller/users_notifications.controller.php',
        {
          mode: 'update_users_notifications',
          iduser_notifications,
          seen: 1 // Marcamos la notificación como vista.
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
  
      // Obtener la lista actualizada de notificaciones
      const notifications = await getNotifications({ idproject, user_id });
      io.to(`user_${user_id}`).emit('all-notifications', notifications);
      console.log(`Notificación ${idnotifications} marcada como vista. Lista actualizada enviada a usuario ${user_id}.`);
    } catch (error) {
      console.error('Error actualizando notificación:', error);
    }
  });

  /**
   * Evento 'send-notification':
   * Se espera recibir un objeto con { idproject, user_id, type_ntf, message, title_ntf, name_project, [date_expired] }.
   * Se inserta la nueva notificación y se emite la lista actualizada a las salas correspondientes.
   */
  socket.on('send-notification', async (data) => {

      // Obtener la lista actualizada de notificaciones
      const notifications = await getNotifications({ idproject: data.idproject, user_id });
      // Emitir la lista actualizada tanto a la sala del proyecto como a la del usuario
      io.to(`project_${data.idproject}`).emit('all-notifications', notifications);
      //io.to(`user_${data.user_id}`).emit('all-notifications', notifications);
      console.log(`Notificación añadida y lista actualizada enviada a usuario ${data.user_id} y proyecto ${data.idproject}.`);

  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}. ¡Hasta la próxima conexión!`);
  });
});

// Inicia el servidor en el puerto configurado o el 3000 por defecto.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
