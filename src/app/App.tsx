import { useState, useRef, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Play, Square, Download, Upload, Trash2 } from 'lucide-react';

// Tipos
type ComponentType = 'esp8266' | 'led' | 'resistor' | 'potentiometer';

interface Pin {
  id: string;
  label: string;
  x: number;
  y: number;
  side: 'left' | 'right';
}

interface Component {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  config?: any;
  pins?: Pin[];
}

interface Connection {
  id: string;
  fromComponentId: string;
  fromPinId: string;
  toComponentId: string;
  toPinId: string;
}

interface PinConnection {
  componentId: string;
  pinId: string;
}

export default function App() {
  const [components, setComponents] = useState<Component[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [code, setCode] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [draggingComponent, setDraggingComponent] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingPin, setConnectingPin] = useState<PinConnection | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
  const [ledStates, setLedStates] = useState<Record<string, number>>({});
  const animationFrameRef = useRef<number>();

  // Pines del ESP8266 NodeMCU
  const esp8266Pins = {
    left: [
      { id: 'A0', label: 'A0', offset: 0 },
      { id: 'RST', label: 'RST', offset: 1 },
      { id: 'EN', label: 'EN', offset: 2 },
      { id: '3V3_L', label: '3V3', offset: 3 },
      { id: 'GND_L1', label: 'GND', offset: 4 },
      { id: 'CLK', label: 'CLK', offset: 5 },
      { id: 'SD0', label: 'SD0', offset: 6 },
      { id: 'CMD', label: 'CMD', offset: 7 },
      { id: 'SD1', label: 'SD1', offset: 8 },
      { id: 'SD2', label: 'SD2', offset: 9 },
      { id: 'SD3', label: 'SD3', offset: 10 },
      { id: 'RX_L', label: 'RX', offset: 11 },
      { id: 'TX_L', label: 'TX', offset: 12 },
      { id: 'GND_L2', label: 'GND', offset: 13 },
      { id: '3V3_L2', label: '3V3', offset: 14 }
    ],
    right: [
      { id: 'D0', label: 'D0', offset: 0 },
      { id: 'D1', label: 'D1', offset: 1 },
      { id: 'D2', label: 'D2', offset: 2 },
      { id: 'D3', label: 'D3', offset: 3 },
      { id: 'D4', label: 'D4', offset: 4 },
      { id: 'D5', label: 'D5', offset: 5 },
      { id: 'D6', label: 'D6', offset: 6 },
      { id: 'D7', label: 'D7', offset: 7 },
      { id: 'D8', label: 'D8', offset: 8 },
      { id: '3V3_R', label: '3V3', offset: 9 },
      { id: 'GND_R1', label: 'GND', offset: 10 },
      { id: 'RX_R', label: 'RX', offset: 11 },
      { id: 'TX_R', label: 'TX', offset: 12 },
      { id: 'GND_R2', label: 'GND', offset: 13 },
      { id: 'VIN', label: 'VIN', offset: 14 }
    ]
  };

  // Generar código automáticamente
  useEffect(() => {
    generateCode();
  }, [components, connections]);

  const generateCode = () => {
    let codeLines: string[] = [];
    
    // Encontrar ESP8266
    const esp = components.find(c => c.type === 'esp8266');
    if (!esp) {
      setCode('// Agrega un ESP8266 para comenzar');
      return;
    }

    codeLines.push('// Código generado automáticamente para NodeMCU ESP8266');
    codeLines.push('');
    
    // Definir pines para cada componente conectado
    const pinDefinitions: string[] = [];
    const setupCode: string[] = [];
    const loopCode: string[] = [];
    
    // Mapeo de componentes conectados
    const ledConnections: Array<{compId: string, pin: string}> = [];
    const potConnections: Array<{compId: string, pin: string}> = [];

    components.forEach(comp => {
      if (comp.type === 'led') {
        // Solo aceptamos la conexión que sale del ánodo (+) del LED al ESP8266
        const conn = connections.find(c => 
          (c.fromComponentId === comp.id && c.fromPinId === 'anode' && c.toComponentId === esp.id) ||
          (c.toComponentId === comp.id && c.toPinId === 'anode' && c.fromComponentId === esp.id)
        );
        
        if (conn) {
          // Si el cable viene del ESP, el pin es fromPinId. Si va hacia el ESP, es toPinId.
          const espPin = conn.fromComponentId === esp.id ? conn.fromPinId : conn.toPinId;
          // Limpiamos el nombre (D1_R -> D1) sin borrar los números
          const pinName = espPin.split('_')[0]; 
          ledConnections.push({compId: comp.id, pin: pinName});
        }
      } 
      
      else if (comp.type === 'potentiometer') {
        // CAMBIO IMPORTANTE: Solo buscamos el pin que tiene ID 'signal' (SIG)
        const conn = connections.find(c => 
          (c.fromComponentId === comp.id && c.fromPinId === 'signal' && c.toComponentId === esp.id) ||
          (c.toComponentId === comp.id && c.toPinId === 'signal' && c.fromComponentId === esp.id)
        );
        
        if (conn) {
          const espPin = conn.fromComponentId === esp.id ? conn.fromPinId : conn.toPinId;
          // Limpiamos el nombre (D1_R -> D1 o A0_L -> A0)
          const pinName = espPin.split('_')[0]; 
          potConnections.push({compId: comp.id, pin: pinName});
        }
      }
    });
    // Generar definiciones de pines
    ledConnections.forEach((led, idx) => {
      pinDefinitions.push(`#define LED_PIN_${idx + 1} ${led.pin}`);
    });
    
    potConnections.forEach((pot, idx) => {
      pinDefinitions.push(`#define POT_PIN_${idx + 1} ${pot.pin}`);
    });

    if (pinDefinitions.length > 0) {
      codeLines.push(...pinDefinitions);
      codeLines.push('');
    }

    // Variables globales
    if (potConnections.length > 0 && ledConnections.length > 0) {
      codeLines.push('int potValue = 0;');
      codeLines.push('int brightness = 0;');
      codeLines.push('');
    }

    // Setup
    codeLines.push('void setup() {');
    codeLines.push('  Serial.begin(115200);');
    
    ledConnections.forEach((led, idx) => {
      setupCode.push(`  pinMode(LED_PIN_${idx + 1}, OUTPUT);`);
    });
    
    if (setupCode.length > 0) {
      codeLines.push(...setupCode);
    }
    
    codeLines.push('  Serial.println("ESP8266 iniciado");');
    codeLines.push('}');
    codeLines.push('');

    // Loop
    codeLines.push('void loop() {');
    
    if (potConnections.length > 0 && ledConnections.length > 0) {
      // Código para leer potenciómetro y controlar LED con PWM
      codeLines.push('  // Leer valor del potenciómetro');
      potConnections.forEach((pot, idx) => {
        codeLines.push(`  potValue = analogRead(POT_PIN_${idx + 1});`);
      });
      codeLines.push('  ');
      codeLines.push('  // Convertir a rango PWM (0-1023 a 0-255)');
      codeLines.push('  brightness = map(potValue, 0, 1023, 0, 255);');
      codeLines.push('  ');
      codeLines.push('  // Controlar intensidad del LED con PWM');
      ledConnections.forEach((led, idx) => {
        codeLines.push(`  analogWrite(LED_PIN_${idx + 1}, brightness);`);
      });
      codeLines.push('  ');
      codeLines.push('  // Imprimir valores en monitor serial');
      codeLines.push('  Serial.print("Potenciometro: ");');
      codeLines.push('  Serial.print(potValue);');
      codeLines.push('  Serial.print(" | Brillo LED: ");');
      codeLines.push('  Serial.println(brightness);');
      codeLines.push('  ');
      codeLines.push('  delay(100);');
    } else if (ledConnections.length > 0) {
      // Solo parpadeo simple
      codeLines.push('  // Parpadeo simple del LED');
      ledConnections.forEach((led, idx) => {
        codeLines.push(`  digitalWrite(LED_PIN_${idx + 1}, HIGH);`);
      });
      codeLines.push('  delay(500);');
      ledConnections.forEach((led, idx) => {
        codeLines.push(`  digitalWrite(LED_PIN_${idx + 1}, LOW);`);
      });
      codeLines.push('  delay(500);');
    } else {
      codeLines.push('  // Código principal aquí');
      codeLines.push('  delay(100);');
    }
    
    codeLines.push('}');

    setCode(codeLines.join('\n'));
  };

  // Agregar componente
  const addComponent = (type: ComponentType) => {
    const newComponent: Component = {
      id: `${type}_${Date.now()}`,
      type,
      x: 100,
      y: 100,
      config: type === 'led' ? { color: '#ff0000' } : 
             type === 'resistor' ? { value: 220 } :
             type === 'potentiometer' ? { value: 512 } : {}
    };

    // Agregar pines según el tipo
    if (type === 'esp8266') {
      const pins: Pin[] = [];
      const width = 120;
      const height = esp8266Pins.left.length * 20;
      
      esp8266Pins.left.forEach(pin => {
        pins.push({
          id: pin.id,
          label: pin.label,
          x: 0,
          y: pin.offset * 20 + 10,
          side: 'left'
        });
      });
      
      esp8266Pins.right.forEach(pin => {
        pins.push({
          id: pin.id,
          label: pin.label,
          x: width,
          y: pin.offset * 20 + 10,
          side: 'right'
        });
      });
      
      newComponent.pins = pins;
    } else if (type === 'led') {
      newComponent.pins = [
        { id: 'anode', label: '+', x: 20, y: 0, side: 'left' },
        { id: 'cathode', label: '-', x: 20, y: 50, side: 'left' }
      ];
    } else if (type === 'resistor') {
      newComponent.pins = [
        { id: 'pin1', label: '1', x: 0, y: 15, side: 'left' },
        { id: 'pin2', label: '2', x: 80, y: 15, side: 'right' }
      ];
    } else if (type === 'potentiometer') {
      newComponent.pins = [
        { id: 'vcc', label: 'VCC', x: 10, y: 65, side: 'left' },
        { id: 'signal', label: 'SIG', x: 35, y: 65, side: 'left' },
        { id: 'gnd', label: 'GND', x: 60, y: 65, side: 'right' }
      ];
    }

    setComponents([...components, newComponent]);
  };

  // Mouse handlers para drag
  const handleMouseDown = (e: React.MouseEvent, componentId: string) => {
    const component = components.find(c => c.id === componentId);
    if (!component) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDraggingComponent(componentId);
    setDragOffset({
      x: mouseX - component.x,
      y: mouseY - component.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingComponent) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setComponents(components.map(comp => 
      comp.id === draggingComponent
        ? { ...comp, x: mouseX - dragOffset.x, y: mouseY - dragOffset.y }
        : comp
    ));
  };

  const handleMouseUp = () => {
    setDraggingComponent(null);
  };

  // Click en pin para conectar
  const handlePinClick = (componentId: string, pinId: string) => {
    if (!connectingPin) {
      // Iniciar conexión
      setConnectingPin({ componentId, pinId });
    } else {
      // Completar conexión
      if (connectingPin.componentId !== componentId) {
        const newConnection: Connection = {
          id: `conn_${Date.now()}`,
          fromComponentId: connectingPin.componentId,
          fromPinId: connectingPin.pinId,
          toComponentId: componentId,
          toPinId: pinId
        };
        setConnections([...connections, newConnection]);
      }
      setConnectingPin(null);
    }
  };

  // Dibujar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpiar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibujar grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Dibujar conexiones
    connections.forEach(conn => {
      const fromComp = components.find(c => c.id === conn.fromComponentId);
      const toComp = components.find(c => c.id === conn.toComponentId);
      
      if (fromComp && toComp && fromComp.pins && toComp.pins) {
        const fromPin = fromComp.pins.find(p => p.id === conn.fromPinId);
        const toPin = toComp.pins.find(p => p.id === conn.toPinId);
        
        if (fromPin && toPin) {
          const x1 = fromComp.x + fromPin.x;
          const y1 = fromComp.y + fromPin.y;
          const x2 = toComp.x + toPin.x;
          const y2 = toComp.y + toPin.y;
          
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00ffff';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    });

    // Dibujar línea de conexión temporal
    if (connectingPin) {
      const comp = components.find(c => c.id === connectingPin.componentId);
      if (comp && comp.pins) {
        const pin = comp.pins.find(p => p.id === connectingPin.pinId);
        if (pin) {
          // Esta línea se actualizará con el mouse
        }
      }
    }

    // Dibujar componentes
    components.forEach(comp => {
      if (comp.type === 'esp8266') {
        drawESP8266(ctx, comp);
      } else if (comp.type === 'led') {
        drawLED(ctx, comp, ledStates[comp.id] || 0);
      } else if (comp.type === 'resistor') {
        drawResistor(ctx, comp);
      } else if (comp.type === 'potentiometer') {
        drawPotentiometer(ctx, comp);
      }
    });
  }, [components, connections, ledStates, connectingPin]);

  // Dibujar ESP8266
  const drawESP8266 = (ctx: CanvasRenderingContext2D, comp: Component) => {
    const width = 120;
    const height = 300;
    
    // Cuerpo principal
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(comp.x, comp.y, width, height);
    
    // Borde
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(comp.x, comp.y, width, height);
    
    // Chip ESP-12E
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(comp.x + 20, comp.y + 50, 80, 60);
    
    // Texto ESP8266
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ESP8266', comp.x + width / 2, comp.y + 30);
    ctx.fillText('NodeMCU', comp.x + width / 2, comp.y + 80);
    
    // Puerto USB
    ctx.fillStyle = '#444';
    ctx.fillRect(comp.x + 45, comp.y - 5, 30, 10);
    
    // Dibujar pines
    if (comp.pins) {
      comp.pins.forEach(pin => {
        const pinX = comp.x + pin.x;
        const pinY = comp.y + pin.y;
        
        // Pin
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Hover effect
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px monospace';
        ctx.textAlign = pin.side === 'left' ? 'right' : 'left';
        const labelX = pin.side === 'left' ? pinX - 8 : pinX + 8;
        ctx.fillText(pin.label, labelX, pinY + 3);
      });
    }
  };

  // Dibujar LED
  const drawLED = (ctx: CanvasRenderingContext2D, comp: Component, brightness: number) => {
    const color = comp.config?.color || '#ff0000';
    
    // Cuerpo del LED
    ctx.fillStyle = brightness > 0 ? adjustBrightness(color, brightness) : '#333';
    ctx.beginPath();
    ctx.arc(comp.x + 20, comp.y + 25, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Glow effect si está encendido
    if (brightness > 0) {
      ctx.shadowBlur = 25 * brightness;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(comp.x + 20, comp.y + 25, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    
    // Borde
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Pines más grandes
    if (comp.pins) {
      comp.pins.forEach(pin => {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(comp.x + pin.x, comp.y + pin.y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Borde del pin
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(pin.label, comp.x + pin.x + 15, comp.y + pin.y + 5);
      });
    }
  };

  // Ajustar brillo del color
  const adjustBrightness = (color: string, brightness: number): string => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    
    const newR = Math.round(r * brightness);
    const newG = Math.round(g * brightness);
    const newB = Math.round(b * brightness);
    
    return `rgb(${newR}, ${newG}, ${newB})`;
  };

  // Dibujar resistencia
  const drawResistor = (ctx: CanvasRenderingContext2D, comp: Component) => {
    const value = comp.config?.value || 220;
    
    // Cuerpo
    ctx.fillStyle = '#d2b48c';
    ctx.fillRect(comp.x + 15, comp.y + 8, 50, 14);
    
    // Bandas de color (simplificado)
    ctx.fillStyle = '#000';
    ctx.fillRect(comp.x + 22, comp.y + 6, 4, 18);
    ctx.fillRect(comp.x + 35, comp.y + 6, 4, 18);
    ctx.fillRect(comp.x + 48, comp.y + 6, 4, 18);
    
    // Pines más grandes
    if (comp.pins) {
      comp.pins.forEach(pin => {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(comp.x + pin.x, comp.y + pin.y);
        ctx.lineTo(comp.x + pin.x + (pin.side === 'left' ? 15 : -15), comp.y + pin.y);
        ctx.stroke();
        
        // Pin point más grande
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(comp.x + pin.x, comp.y + pin.y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Borde del pin
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
    
    // Valor
    ctx.fillStyle = '#fff';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${value}Ω`, comp.x + 40, comp.y + 35);
  };

  // Dibujar potenciómetro
  const drawPotentiometer = (ctx: CanvasRenderingContext2D, comp: Component) => {
    const value = comp.config?.value || 512;
    const angle = (value / 1023) * Math.PI * 1.5 - Math.PI * 0.75;
    
    // Cuerpo
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(comp.x + 35, comp.y + 30, 22, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Perilla
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(comp.x + 35, comp.y + 30);
    ctx.lineTo(
      comp.x + 35 + Math.cos(angle) * 16,
      comp.y + 30 + Math.sin(angle) * 16
    );
    ctx.stroke();
    
    // Pines más grandes
    if (comp.pins) {
      comp.pins.forEach((pin) => {
        const pinX = comp.x + pin.x;
        const pinY = comp.y + pin.y;
        
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(pinX, pinY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Borde del pin
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(pin.label, pinX, pinY + 16);
      });
    }
    
    // Valor
    ctx.fillStyle = '#fff';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${value}`, comp.x + 35, comp.y + 36);
  };

  // Simulación
  useEffect(() => {
    if (!isRunning) {
      setLedStates({});
      return;
    }

    // Actualizar estados de LEDs basados en conexiones
    const updateLedStates = () => {
      const newStates: Record<string, number> = {};
      
      components.forEach(comp => {
        if (comp.type === 'led') {
          // Verificar si el LED está conectado al ESP8266
          const ledToEspConn = connections.find(c => 
            (c.fromComponentId === comp.id || c.toComponentId === comp.id) &&
            (components.find(co => co.id === c.fromComponentId)?.type === 'esp8266' ||
             components.find(co => co.id === c.toComponentId)?.type === 'esp8266')
          );
          
          if (ledToEspConn) {
            // Buscar si hay un potenciómetro conectado al ESP8266
            let hasPotentiometer = false;
            let potValue = 512;
            
            connections.forEach(potConn => {
              const fromComp = components.find(c => c.id === potConn.fromComponentId);
              const toComp = components.find(c => c.id === potConn.toComponentId);
              
              // Verificar si hay un potenciómetro conectado al ESP8266
              if ((fromComp?.type === 'potentiometer' && toComp?.type === 'esp8266') ||
                  (toComp?.type === 'potentiometer' && fromComp?.type === 'esp8266')) {
                hasPotentiometer = true;
                const potComp = fromComp?.type === 'potentiometer' ? fromComp : toComp;
                potValue = potComp?.config?.value || 512;
              }
            });
            
            if (hasPotentiometer) {
              // LED con intensidad constante basada en potenciómetro
              newStates[comp.id] = potValue / 1023;
            } else {
              // LED totalmente encendido si solo está conectado al ESP8266
              newStates[comp.id] = 1;
            }
          }
        }
      });
      
      setLedStates(newStates);
    };

    updateLedStates();
  }, [isRunning, components, connections]);

  // Actualizar valor del potenciómetro
const updatePotValue = (componentId: string, newValue: number) => {
setComponents(components.map(comp =>
comp.id === componentId
? { ...comp, config: { ...comp.config, value: newValue } }
: comp
));
};

  // Click en canvas para ajustar potenciómetro
  const handleCanvasClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    components.forEach(comp => {
      if (comp.type === 'potentiometer') {
        const dx = mouseX - (comp.x + 35);
        const dy = mouseY - (comp.y + 30);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 22) {
          // Ajustar valor basado en ángulo
          let angle = Math.atan2(dy, dx);
          angle = (angle + Math.PI * 0.75) / (Math.PI * 1.5);
          const newValue = Math.max(0, Math.min(1023, Math.round(angle * 1023)));
          updatePotValue(comp.id, newValue);
        }
      }
    });
  };

  // Syntax highlighting para Arduino
  const highlightArduinoCode = (code: string) => {
  if (!code) return '';

  // 1. Limpiamos cualquier rastro de HTML previo para que no se confunda
  let text = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Definimos qué queremos pintar (REGEX)
  const patterns = [
    { type: 'comment', regex: /(\/\/.*$)/gm, color: '#7d8c93' },
    { type: 'string', regex: /("[^"]*")/g, color: '#e67e22' },
    { type: 'preprocessor', regex: /(#\w+)/g, color: '#7d8c93' },
    { type: 'keyword', regex: /\b(void|int|float|char|if|else|for|while|return|HIGH|LOW|INPUT|OUTPUT)\b/g, color: '#d35400' },
    { type: 'function', regex: /\b(setup|loop|pinMode|digitalWrite|analogRead|analogWrite|delay|Serial|map|begin|println|print)\b/g, color: '#00979d' },
    { type: 'number', regex: /\b(\d+)\b/g, color: '#00979d' }
  ];

  // 3. Aplicamos el color de forma segura usando un marcador temporal
  // Esto evita que el color de un comentario rompa el color de un string
  let tokens: {id: string, html: string}[] = [];
  
  patterns.forEach((p, i) => {
    text = text.replace(p.regex, (match) => {
      const id = `__TOKEN_${i}_${tokens.length}__`;
      tokens.push({
        id,
        html: `<span style="color: ${p.color}">${match}</span>`
      });
      return id;
    });
  });

  // 4. Devolvemos los tokens a su lugar
  tokens.forEach(token => {
    text = text.replace(token.id, token.html);
  });

  return text;
};

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen bg-[#0a0a0a] text-white">
        {/* Panel izquierdo - Editor de código */}
        <div className="w-1/2 flex flex-col border-r border-gray-700">
          {/* Barra de herramientas estilo Arduino IDE */}
          <div className="bg-[#4e4e4e] p-2 flex items-center gap-2 border-b border-gray-600">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#008184] hover:bg-[#00979d] transition-colors"
            >
              {isRunning ? (
                <>
                  <Square className="w-4 h-4" />
                  Detener
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Ejecutar
                </>
              )}
            </button>
            
            <button
              onClick={() => {
                const blob = new Blob([code], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'sketch.ino';
                a.click();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded bg-[#5a5a5a] hover:bg-[#6a6a6a] transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => setConnections([])}
              className="flex items-center gap-2 px-3 py-2 rounded bg-[#5a5a5a] hover:bg-[#6a6a6a] transition-colors ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar Conexiones
            </button>
          </div>

          {/* Editor de código */}
          <div className="flex-1 flex flex-col bg-[#2d2d2d]">
            <div className="flex-1 relative">
              <textarea
                ref={editorRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="absolute inset-0 w-full h-full p-4 pl-12 bg-transparent text-transparent caret-white font-mono text-sm resize-none outline-none"
                style={{ 
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  lineHeight: '1.5',
                  tabSize: 2
                }}
                spellCheck={false}
              />
              
              {/* Números de línea */}
              <div className="absolute top-0 left-0 p-4 pr-2 text-right text-[#7d8c93] font-mono text-sm pointer-events-none select-none" style={{ lineHeight: '1.5' }}>
                {code.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              
              {/* Código con syntax highlighting */}
              <div 
                className="absolute top-0 left-0 p-4 pl-12 font-mono text-sm pointer-events-none select-none whitespace-pre"
                style={{ 
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  lineHeight: '1.5',
                  color: '#d4d4d4'
                }}
                dangerouslySetInnerHTML={{ __html: highlightArduinoCode(code) }}
              />
            </div>
            
            {/* Barra de estado */}
            <div className="bg-[#008184] px-4 py-1 text-xs flex items-center justify-between">
              <span>NodeMCU 1.0 (ESP-12E Module)</span>
              <span>{code.split('\n').length} líneas</span>
            </div>
          </div>
        </div>

        {/* Panel derecho - Simulador */}
        <div className="w-1/2 flex flex-col">
          {/* Barra de componentes */}
          <div className="bg-[#1a1a1a] p-4 border-b border-gray-700">
            <h3 className="text-sm font-semibold mb-3 text-[#00d4ff]">Componentes</h3>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => addComponent('esp8266')}
                className="px-4 py-2 bg-[#00d4ff] text-black rounded hover:bg-[#00a8cc] transition-colors font-medium"
                disabled={components.some(c => c.type === 'esp8266')}
              >
                ESP8266
              </button>
              <button
                onClick={() => addComponent('led')}
                className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
              >
                LED
              </button>
              <button
                onClick={() => addComponent('resistor')}
                className="px-4 py-2 bg-yellow-700 rounded hover:bg-yellow-800 transition-colors"
              >
                Resistencia
              </button>
              <button
                onClick={() => addComponent('potentiometer')}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                Potenciómetro
              </button>
            </div>
            
            {connectingPin && (
              <div className="mt-3 p-2 bg-yellow-900/30 border border-yellow-600 rounded text-sm">
                🔗 Conectando... Haz clic en otro pin para completar la conexión
                <button
                  onClick={() => setConnectingPin(null)}
                  className="ml-2 px-2 py-1 bg-red-600 rounded text-xs"
                >
                  Cancelar
                </button>
              </div>
            )}
            
            <div className="mt-2 text-xs text-gray-400">
              Conexiones: {connections.length} | Componentes: {components.length}
            </div>
          </div>

          {/* Canvas de simulación */}
          <div className="flex-1 overflow-auto bg-[#0a0a0a] relative">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="cursor-crosshair"
              onMouseDown={(e) => {
                // Detectar clic en componente
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                // Primero verificar si se hizo clic en un pin
                let clickedPin = false;
                for (const comp of components) {
                  if (comp.pins) {
                    for (const pin of comp.pins) {
                      const pinX = comp.x + pin.x;
                      const pinY = comp.y + pin.y;
                      const distance = Math.sqrt((mouseX - pinX) ** 2 + (mouseY - pinY) ** 2);
                      
                      if (distance < 12) {
                        handlePinClick(comp.id, pin.id);
                        clickedPin = true;
                        break;
                      }
                    }
                    if (clickedPin) break;
                  }
                }
                
                // Si no se hizo clic en un pin, verificar componente
                if (!clickedPin) {
                  for (const comp of components) {
                    const width = comp.type === 'esp8266' ? 120 : 
                                 comp.type === 'led' ? 30 :
                                 comp.type === 'resistor' ? 60 :
                                 comp.type === 'potentiometer' ? 60 : 50;
                    const height = comp.type === 'esp8266' ? 300 :
                                  comp.type === 'led' ? 40 :
                                  comp.type === 'resistor' ? 20 :
                                  comp.type === 'potentiometer' ? 70 : 50;
                    
                    if (mouseX >= comp.x && mouseX <= comp.x + width &&
                        mouseY >= comp.y && mouseY <= comp.y + height) {
                      handleMouseDown(e, comp.id);
                      break;
                    }
                  }
                }
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleCanvasClick}
            />
            
            {components.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
                <div className="text-center">
                  <p className="text-lg mb-2">👆 Agrega componentes para comenzar</p>
                  <p className="text-sm">Haz clic en los pines para conectarlos</p>
                </div>
              </div>
            )}
            
            {/* Panel de control de potenciómetros */}
            {components.filter(c => c.type === 'potentiometer').length > 0 && (
              <div className="absolute bottom-4 right-4 bg-[#1a1a2e] border-2 border-[#00d4ff] rounded-lg p-4 min-w-[250px]">
                <h4 className="text-sm font-bold text-[#00d4ff] mb-3">Control de Potenciómetros</h4>
                {components.filter(c => c.type === 'potentiometer').map((pot, idx) => (
                  <div key={pot.id} className="mb-4">
                    <label className="text-xs text-gray-300 mb-1 block">
                      Potenciómetro #{idx + 1}: <span className="text-[#00d4ff] font-bold">{pot.config?.value || 512}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1023"
                      value={pot.config?.value || 512}
                      onChange={(e) => updatePotValue(pot.id, parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                          background: `linear-gradient(to right, #00d4ff 0%, #00d4ff ${((pot.config?.value || 512) / 1023) * 100}%, #374151 ${((pot.config?.value || 512) / 1023) * 100}%, #374151 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0</span>
                      <span>512</span>
                      <span>1023</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DndProvider>
  );
}