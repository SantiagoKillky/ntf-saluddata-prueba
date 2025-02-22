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
const relativeTime = require('dayjs/plugin/relativeTime');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

dayjs.locale('es'); // Configura el idioma a español

// Si deseas establecer una zona horaria por defecto (opcional)
dayjs.tz.setDefault("America/Lima");

// Middleware para parsear JSON en las peticiones
app.use(express.json());

// URL de la API externa que maneja el CRUD de notificaciones
const externalAPI = 'https://dev.hostcloudpe.lat/adminkillky/v3/module/notifications/controller/notifications.controller.php';

/**
 * Endpoint HTTP que actúa como proxy para la API externa.
 * Aquí se puede enviar peticiones desde el cliente si se requiere.
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
 * Socket.IO: Manejo de la comunicación en tiempo real.
 */
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  
  /**
   * Evento 'join':
   * El cliente debe enviar un objeto con { project_id, user_id }.
   * Se une a dos salas:
   * - "project_{project_id}" para notificaciones relacionadas al proyecto.
   * - "user_{user_id}" para notificaciones individuales del usuario.
   * Además, se consulta el historial de notificaciones para ese usuario y proyecto.
   */
  socket.on('join', async (data) => {
    const { idproject, user_id } = data;
    
    // Unir al usuario a las salas correspondientes
    socket.join(`project_${idproject}`);
    socket.join(`user_${user_id}`);
    console.log(`Usuario ${user_id} se unió al proyecto ${idproject}.`);

    try {
        const response = await axios.post(externalAPI, {
            mode: 'select_notifications_project',
            user_id, idproject
        }, { headers: { 'Content-Type': 'application/json' }});

        // Convertir created_at a la hora de Lima y formatearlo en tiempo relativo
        const notifications = response.data.notifications.data.map(notification => {
          return {
            ...notification,
            created_at: dayjs(notification.created_at)
                    .tz("America/Lima")
                    .fromNow() // Ej.: "hace 5 minutos"
          };
        });

        // Emitir solo a la sala del usuario específico
        io.to(`user_${user_id}`).emit('all-notifications', notifications);
        
        console.log(`response.data = ${JSON.stringify(notifications)}`);

    } catch (error) {
        console.error('Error al cargar notificaciones en join:', error);
    }
});


  /**
   * Evento 'send-notification':
   * El cliente debe enviar un objeto con, al menos, { project_id, user_id, message, type_notif, title_notif, name_project }.
   * Opcionalmente, puede enviar fecha_vencimiento.
   * Se utiliza el modo "insert_notifications" para insertar la notificación.
   */
  /*
  socket.on('send-notification', async (data) => {
    try {
      const response = await axios.post(externalAPI, {
        mode: 'insert_notifications',
        project_id: data.project_id,
        user_id: data.user_id,
        type_notif: data.type_notif,       // Por ejemplo: "info", "warning", etc.
        mensaje_notif: data.message,        // Contenido de la notificación.
        title_notif: data.title_notif,        // Título de la notificación.
        name_project: data.name_project,      // Nombre del proyecto.
        fecha_vencimiento: data.fecha_vencimiento || null // Fecha de caducación (si aplica).
      }, { headers: { 'Content-Type': 'application/json' }});
      
      // Se asume que la API retorna la notificación creada en response.data.notification
      const notification = response.data.notification;
      // Emitir la notificación a la sala del proyecto y del usuario
      io.to(`project_${data.project_id}`).emit('notificacion', notification);
      io.to(`user_${data.user_id}`).emit('notificacion', notification);
    } catch (error) {
      console.error('Error enviando notificación:', error);
    }
  });*/

  /**
   * Evento 'notification-viewed':
   * Permite marcar una notificación como vista.
   * Se espera recibir { project_id, user_id, idnotifications }.
   * Se utiliza el modo "update_notifications" y se actualiza el campo "seen" a 1.
   */
  /*socket.on('notification-viewed', async (data) => {
    try {
      const response = await axios.post(externalAPI, {
        mode: 'update_notifications',
        project_id: data.project_id,
        user_id: data.user_id,
        idnotifications: data.idnotifications,
        seen: 1  // Marcamos la notificación como vista.
      }, { headers: { 'Content-Type': 'application/json' }});
      
      // Se puede emitir la notificación actualizada al usuario
      socket.emit('notification-updated', response.data.notification);
    } catch (error) {
      console.error('Error actualizando notificación:', error);
    }
  });*/

  /**
   * Evento 'delete-notification':
   * Permite eliminar una notificación.
   * Se espera recibir { project_id, user_id, idnotifications }.
   * Se utiliza el modo "delete_notifications".
   */
  /*
  socket.on('delete-notification', async (data) => {
    try {
      const response = await axios.post(externalAPI, {
        mode: 'delete_notifications',
        project_id: data.project_id,
        user_id: data.user_id,
        idnotifications: data.idnotifications
      }, { headers: { 'Content-Type': 'application/json' }});
      
      socket.emit('notification-deleted', response.data);
    } catch (error) {
      console.error('Error eliminando notificación:', error);
    }
  });*/

  /**
   * Evento 'describe-notifications':
   * Permite obtener la descripción o estructura de las notificaciones.
   */
  /*
  socket.on('describe-notifications', async () => {
    try {
      const response = await axios.post(externalAPI, {
        mode: 'describe_notifications'
      }, { headers: { 'Content-Type': 'application/json' }});
      socket.emit('notifications-described', response.data);
    } catch (error) {
      console.error('Error describiendo notificaciones:', error);
    }
  });*/

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Inicia el servidor en el puerto configurado o el 3000 por defecto.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
