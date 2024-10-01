import os
from dotenv import load_dotenv
from flask import Flask, request
import requests
import json
import re
import datetime
import pytz 

load_dotenv()  # Carga las variables de entorno desde .env

app = Flask(__name__)

# Diccionario para almacenar el historial de conversaciones y datos de reserva
conversation_history = {}
reservation_data = {}

# Ruta del webhook para recibir mensajes de WhatsApp
@app.route('/webhook', methods=['GET', 'POST'])
def webhook():
    if request.method == 'GET':
        # Manejo de la verificación del webhook
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')

        if mode and token:
            if mode == 'subscribe' and token == os.getenv('VERIFY_TOKEN'):
                return challenge, 200
            else:
                return 'Forbidden', 403
    
    elif request.method == 'POST':
        data = request.get_json()

        try:
            # Obtener el mensaje y número de teléfono del usuario
            message = data['entry'][0]['changes'][0]['value']['messages'][0]['text']['body']
            phone_number = data['entry'][0]['changes'][0]['value']['messages'][0]['from']
        except KeyError:
            return 'OK', 200

        
        # Obtener el contexto de Google Sheets
        context = get_context_from_sheets()

        # Obtener el historial de la conversación
        history = conversation_history.get(phone_number, [])

        # Añadir el mensaje actual al historial
        history.append({"role": "user", "content": message})

        
        # Obtener la respuesta de ChatGPT
        gpt_response = send_to_chatgpt(history, context)
        print("Respuesta de GPT:", gpt_response)

        # Enviar gpt_response al script y obtener la respuesta
        script_response = send_to_script(gpt_response, phone_number)
        print("Respuesta del script:", script_response)

        # Usar la respuesta del script si está disponible, de lo contrario usar la respuesta de GPT
        response_to_user = script_response["result"]

        # Añadir la respuesta al historial con el rol de asistente
        history.append({"role": "assistant", "content": response_to_user})

        # Actualizar el historial de la conversación
        conversation_history[phone_number] = history[-10:]  # Mantener solo los últimos 10 mensajes

        # Enviar la respuesta al usuario de WhatsApp
        send_to_whatsapp(phone_number, response_to_user)

        return 'OK', 200

def get_context_from_sheets():
    sheets_url = os.getenv('GOOGLE_SHEETS_URL')
    response = requests.get(f"{sheets_url}?action=getContext")
    return response.json().get('context', '')



def send_to_chatgpt(history, context):
    api_key = os.getenv('OPENAI_API_KEY')
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    
    # Obtener la fecha y hora actual en Santiago de Chile
    santiago_tz = pytz.timezone('America/Santiago')
    fecha_hora_actual = datetime.datetime.now(santiago_tz)
    
    # Formatear la fecha y hora actual
    fecha_actual = fecha_hora_actual.strftime("%d-%m-%y")
    hora_actual = fecha_hora_actual.strftime("%H:%M")
    dia_semana = fecha_hora_actual.strftime("%A")
    # Traducir el día de la semana al español
    dias_semana = {
        'Monday': 'Lunes',
        'Tuesday': 'Martes',
        'Wednesday': 'Miércoles',
        'Thursday': 'Jueves',
        'Friday': 'Viernes',
        'Saturday': 'Sábado',
        'Sunday': 'Domingo'
    }
    dia_semana_es = dias_semana[dia_semana]
    
    
    # Añadir la fecha, hora y día de la semana actual al contexto
    context_with_datetime = f"{context}\nHoy es {dia_semana_es}. La fecha actual es: {fecha_actual}. La hora actual en Santiago de Chile es: {hora_actual}."

    # Crear la lista de mensajes con los roles correctos
    messages = [{"role": "system", "content": context_with_datetime}]
    for message in history:
        messages.append({"role": message["role"], "content": message["content"]})
    
    data = {
        "model": "gpt-3.5-turbo",
        "messages": messages,
        "temperature": 0.3
    }
    
    response = requests.post('https://api.openai.com/v1/chat/completions', headers=headers, json=data)
    response_json = response.json()

    return response_json['choices'][0]['message']['content']

def send_to_script(gpt_response, phone_number):
    script_url = os.getenv('GOOGLE_SHEETS_URL')
    data = {
        'response': gpt_response,
        'phoneNumber': phone_number
    }
    try:
        response = requests.post(script_url, json=data)
        response.raise_for_status()
        
        # Intentar decodificar la respuesta JSON
        try:
            script_response = response.json()
            
            # Verificar si la respuesta contiene un resultado
            if 'result' in script_response and script_response['result']:
                print("Respuesta recibida del script con éxito")
                return script_response
            else:
                print("El script no devolvió un resultado válido")
                return {"result": gpt_response}
        
        except json.JSONDecodeError:
            print(f"Error al decodificar la respuesta JSON. Contenido de la respuesta: {response.text}")
            return {"result": gpt_response}
    
    except requests.exceptions.RequestException as e:
        print(f"Error al enviar la respuesta al script: {e}")
        return {"result": gpt_response}



def send_to_whatsapp(phone_number, gpt_response):
    whatsapp_api_url = os.getenv('WHATSAPP_API_URL')
    
    headers = {
        'Authorization': f'Bearer {os.getenv("META_ACCESS_TOKEN")}',
        'Content-Type': 'application/json',
    }
    
    data = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "text": {"body": gpt_response}
    }
    
    requests.post(whatsapp_api_url, headers=headers, json=data)



if __name__ == '__main__':
    app.run(port=5000, debug=True)