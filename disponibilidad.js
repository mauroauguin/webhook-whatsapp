function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  
  if (e.parameter.action === 'getContext') {
    var confSheet = sheet.getSheetByName('Conf');
    var context = confSheet.getRange('A1').getValue();
    return ContentService.createTextOutput(JSON.stringify({context: context})).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Manejar otras acciones si es necesario
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  
  if (data.response) {
    var result = procesarRespuesta(data.response, data.phoneNumber);
    return ContentService.createTextOutput(JSON.stringify({result: result})).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Manejar otras acciones si es necesario
  return ContentService.createTextOutput(JSON.stringify({status: 'OK'})).setMimeType(ContentService.MimeType.JSON);
}

function procesarRespuesta(response, phoneNumber) {
  Logger.log("Iniciando procesamiento de respuesta: " + response);
  
  var dateMatch = response.match(/fecha:\s*([^,]+)/i);
  var timeMatch = response.match(/hora:\s*([^,]+)/i);
  var planeMatch = response.match(/avión:\s*([^,]+)/i);
  var tiempoMatch = response.match(/tiempo:\s*([^,]+)/i);
  var correoMatch = response.match(/correo:\s*([^,]+)/i);
  var nombreMatch = response.match(/nombre:\s*([^,]+)/i);
  var vueloMatch = response.match(/vuelo:\s*([^,]+)/i);
  
  Logger.log("Resultados de las coincidencias: " + 
             "Fecha: " + (dateMatch ? dateMatch[1].trim() : "No encontrada") + ", " +
             "Hora: " + (timeMatch ? timeMatch[1].trim() : "No encontrada") + ", " +
             "Avión: " + (planeMatch ? planeMatch[1].trim() : "No encontrado") + ", " +
             "Tiempo: " + (tiempoMatch ? tiempoMatch[1].trim() : "No encontrado") + ", " +
             "Correo: " + (correoMatch ? correoMatch[1].trim() : "No encontrado") + ", " +
             "Nombre: " + (nombreMatch ? nombreMatch[1].trim() : "No encontrado") + ", " +
             "Vuelo: " + (vueloMatch ? vueloMatch[1].trim() : "No encontrado"));
  
  if (dateMatch) {
    var fecha = dateMatch[1].trim();
    
    // Si solo tenemos la fecha, consultar disponibilidad
    if (!timeMatch && !planeMatch) {
      Logger.log("Solo se encontró la fecha. Consultando disponibilidad.");
      return checkReservations(fecha);
    }
    
    if (dateMatch && timeMatch && planeMatch && tiempoMatch && correoMatch && nombreMatch && vueloMatch) {
      Logger.log("Se encontraron todos los datos necesarios. Intentando hacer la reserva.");
      var reservationData = {
        fecha: dateMatch[1].trim(),
        hora: timeMatch[1].trim(),
        avion: planeMatch[1].trim(),
        tiempo: tiempoMatch[1].trim(),
        correo: correoMatch[1].trim(),
        nombre: nombreMatch[1].trim(),
        vuelo: vueloMatch[1].trim()
      };
      return makeReservation(phoneNumber,reservationData);
    }
  }
  
  // Si no se encontraron los datos necesarios
  return null;
}

function checkReservations(fecha) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reservas');
  var dateColumn = sheet.getRange('C:C').getValues();
  var timeColumn = sheet.getRange('D:D').getValues();
  
  var [day, month, year] = fecha.split('-');
  
  // Crear un objeto Date para comparar
  var searchDateObj = new Date(20 + year, month - 1, day);
  
  var reservedTimes = [];
  
  for (var i = 0; i < dateColumn.length; i++) {
    if (dateColumn[i][0] instanceof Date) {
      var cellDate = dateColumn[i][0];
      
      // Comparar las fechas
      if (cellDate.getDate() === searchDateObj.getDate() &&
          cellDate.getMonth() === searchDateObj.getMonth() &&
          cellDate.getFullYear() === searchDateObj.getFullYear()) {
        // Formatear la hora a HH:MM
        var time = timeColumn[i][0];
        if (time instanceof Date) {
          time = Utilities.formatDate(time, Session.getScriptTimeZone(), "HH:mm");
        } else if (typeof time === 'string') {
          // Si ya es una cadena, asegurarse de que esté en formato HH:MM
          var timeParts = time.split(':');
          if (timeParts.length >= 2) {
            time = timeParts[0].padStart(2, '0') + ':' + timeParts[1].padStart(2, '0');
          } else {
            // Si no es ni Date ni string, usar un valor predeterminado
            time = "00:00";
          }
        }
        reservedTimes.push(time);
      }
    }
  }
  
  // Ordenar las horas reservadas de menor a mayor
  reservedTimes.sort((a, b) => {
    var [aHours, aMinutes] = a.split(':').map(Number);
    var [bHours, bMinutes] = b.split(':').map(Number);
    return aHours * 60 + aMinutes - (bHours * 60 + bMinutes);
  });
  
  if (reservedTimes.length > 0) {
    return "Las siguientes horas están reservadas para la fecha " + fecha + ": \n- " + reservedTimes.join("\n- ") + ".\n\n¿A qué hora quieres reservar?";
  } else {
    return "No hay reservas en esa fecha. ¿A que hora quieres reservar?";
  }
}

function makeReservation(phoneNumber, reservationData) {
  Logger.log("Iniciando proceso de reserva para el número: " + phoneNumber);
  Logger.log("Datos de reserva: " + JSON.stringify(reservationData));
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reservas');
  
  // Verificar si la hora ya está reservada
  var dateColumn = sheet.getRange('C:C').getValues();
  var timeColumn = sheet.getRange('D:D').getValues();
  
  for (var i = 0; i < dateColumn.length; i++) {
    if (dateColumn[i][0] instanceof Date) {
      var cellDate = Utilities.formatDate(dateColumn[i][0], Session.getScriptTimeZone(), "dd-MM-yy");
      var cellTime;
      if (timeColumn[i][0] instanceof Date) {
        cellTime = Utilities.formatDate(timeColumn[i][0], Session.getScriptTimeZone(), "HH:mm");
      } else if (typeof timeColumn[i][0] === 'string') {
        cellTime = timeColumn[i][0];
      } else {
        continue; // Saltar esta iteración si el valor no es ni Date ni string
      }
      
      if (cellDate === reservationData.fecha && cellTime === reservationData.hora) {
        Logger.log("Hora ya reservada: " + reservationData.fecha + " " + reservationData.hora);
        return "Lo siento, esa hora ya está reservada. Por favor, elige otra hora.";
      }
    }
  }
  
  // Si no está reservada, añadir la nueva reserva
  var newRow = [
    new Date(),  // Fecha y hora de la reserva
    phoneNumber,
    reservationData.fecha,
    reservationData.hora,
    reservationData.tiempo,
    reservationData.vuelo,
    reservationData.avion,
    reservationData.nombre,
    reservationData.correo
    
  ];
  
  sheet.appendRow(newRow);
  Logger.log("Nueva reserva añadida: " + JSON.stringify(newRow));
  
  // Enviar correo de confirmación
  sendConfirmationEmail(reservationData);
  
  var confirmationMessage = "Tu reserva ha sido confirmada para el " + reservationData.fecha + " a las " + reservationData.hora + 
         " en el avión " + reservationData.avion + " para un vuelo de " + reservationData.tiempo + 
          ". Tipo de vuelo: " + reservationData.vuelo + ". \n ¡Buen vuelo! Se ha enviado un correo de confirmación a " + reservationData.correo;
  
  Logger.log("Mensaje de confirmación: " + confirmationMessage);
  return confirmationMessage;
}

function sendConfirmationEmail(reservationData) {
  var emailTemplate = HtmlService.createTemplateFromFile('EmailTemplate');
  emailTemplate.reservationData = reservationData;
  
  var htmlBody = emailTemplate.evaluate().getContent();
  
  MailApp.sendEmail({
    to: reservationData.correo,
    subject: "Confirmación de reserva de vuelo",
    htmlBody: htmlBody
  });
}