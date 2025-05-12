import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as topojson from 'topojson-client';
import { CommonModule } from '@angular/common';
import * as Papa from 'papaparse';

// Interfaces para los datos
interface DepartamentoADR {
  provincia: string;
  departamento: string;
  en_adr: number;
}

interface DepartamentoDatos {
  provincia: string;
  departamento: string;
  datos: boolean;
  recuentoTitular?: number;
  recuentoEstablecimiento?: number;
  hectareasSembradas?: number;
  hectareasNoClientes?: number;
  porcentajeNoClientes?: string;
  datosCompletos?: any; // Almacenamos los datos completos para el tooltip
}

@Component({
  selector: 'app-mapa',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mapa.component.html',
  styleUrls: ['./mapa.component.scss']
})
export class MapaComponent implements OnInit {
  private map!: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  
  // Datos procesados
  private departamentosADR: DepartamentoADR[] = [];
  private departamentosConDatos: DepartamentoDatos[] = [];

  constructor() { }

  ngOnInit(): void {
    this.initMap();
    this.cargarDatos();
  }

  private initMap(): void {
    // Crear el mapa
    this.map = L.map('map', {
      center: [-32.5, -60], // Coordenadas para centro de Argentina
      zoom: 6, // Zoom inicial
      zoomControl: true
    });

    // Agregar capa base de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    console.log('Mapa inicializado correctamente');
  }

  private cargarDatos(): void {
    // Cargar datos de ADR
    this.cargarDatosADR()
      .then(() => this.cargarDatosDepartamentos())
      .then(() => this.loadTopoJson())
      .catch(error => console.error('Error al cargar datos:', error));
  }

  private cargarDatosADR(): Promise<void> {
    return new Promise((resolve, reject) => {
      Papa.parse('./assets/adr_departamentos.csv', {
        download: true,
        header: true,
        delimiter: ',', // Aseguramos usar coma como delimitador
        skipEmptyLines: true,
        complete: (result) => {
          this.departamentosADR = result.data
            .filter((item: any) => item.provincia && item.departamento) // Filtrar datos vacíos
            .map((item: any) => ({
              provincia: this.normalizarTexto(item.provincia),
              departamento: this.normalizarTexto(item.departamento),
              en_adr: parseInt(item.en_adr || '0')
            }));
          console.log('Datos ADR cargados:', this.departamentosADR.length, 'departamentos');
          console.log('Muestra de departamentos ADR:', this.departamentosADR.slice(0, 5));
          resolve();
        },
        error: (error) => {
          console.error('Error al cargar datos ADR:', error);
          reject(error);
        }
      });
    });
  }

  private cargarDatosDepartamentos(): Promise<void> {
    return new Promise((resolve, reject) => {
      Papa.parse('./assets/datos-santa_fe.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          this.departamentosConDatos = result.data
            .filter((item: any) => 
              item['PROVINCIA ESTABLECIMIENTO'] && 
              item['PARTIDO ESTABLECIMIENTO']
            )
            .map((item: any) => {
              // Convertir los valores numéricos de string a number
              const hectareasSembradas = this.parseNumericValue(item['Suma de TOTAL DE HECTAREAS SEMBRADAS']);
              const hectareasNoClientes = this.parseNumericValue(item['Total de hectareas de no clientes']);
              
              return {
                provincia: this.normalizarTexto(item['PROVINCIA ESTABLECIMIENTO']),
                departamento: this.normalizarTexto(item['PARTIDO ESTABLECIMIENTO']),
                datos: true,
                recuentoTitular: parseInt(item['Recuento de TITULAR']) || 0,
                recuentoEstablecimiento: parseInt(item['Recuento de NOMBRE ESTABLECIMIENTO']) || 0,
                hectareasSembradas: hectareasSembradas,
                hectareasNoClientes: hectareasNoClientes,
                porcentajeNoClientes: item['Porcentaje de hectareas de no clientes'],
                datosCompletos: item // Guardamos los datos originales completos
              };
            });
          console.log('Datos departamentos cargados:', this.departamentosConDatos.length, 'departamentos');
          console.log('Muestra de departamentos con datos:', this.departamentosConDatos.slice(0, 5));
          resolve();
        },
        error: (error) => {
          console.error('Error al cargar datos de departamentos:', error);
          reject(error);
        }
      });
    });
  }

  private parseNumericValue(value: string): number {
    if (!value) return 0;
    
    // Primero reemplazamos la coma decimal por punto si existe
    const cleanValue = value.replace(',', '.');
    
    // Intentamos convertir a número
    const numValue = parseFloat(cleanValue);
    
    // Devolvemos el valor numérico o 0 si no es válido
    return isNaN(numValue) ? 0 : numValue;
  }

  private loadTopoJson(): void {
    // Cargar el archivo TopoJSON
    fetch('./assets/departamentos-santa_fe.topojson')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        return response.json();
      })
      .then(topoData => {
        console.log('TopoJSON cargado correctamente');
        
        // Convertir TopoJSON a GeoJSON
        if (topoData && topoData.objects) {
          // Obtener el nombre de la primera propiedad en objects
          const objectName = Object.keys(topoData.objects)[0];
          
          if (objectName) {
            const geoJsonData = topojson.feature(topoData, topoData.objects[objectName]) as unknown as GeoJSON.FeatureCollection;
            
            // Log de muestra de features
            if (geoJsonData.features && geoJsonData.features.length > 0) {
              console.log('Muestra de departamentos en GeoJSON:', 
                geoJsonData.features.slice(0, 3).map((f: any) => ({
                  departamento: f.properties.departamento || f.properties.nam,
                  provincia: f.properties.provincia
                }))
              );
            }
            
            this.renderGeoJson(geoJsonData);
          } else {
            console.error('No se encontró ninguna propiedad en el objeto TopoJSON');
          }
        } else {
          console.error('Formato de TopoJSON no válido:', topoData);
        }
      })
      .catch(error => {
        console.error('Error al cargar el TopoJSON:', error);
      });
  }

  private renderGeoJson(geoJsonData: any): void {
    // Eliminar la capa anterior si existe
    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    // Crear una nueva capa GeoJSON
    this.geoJsonLayer = L.geoJSON(geoJsonData, {
      style: (feature) => this.estilizarDepartamento(feature),
      onEachFeature: (feature, layer) => {
        // Asignar popup con el nombre del departamento y su estado
        const propiedades = feature.properties;
        const nombre = propiedades.departamento || propiedades.nam || propiedades.nombre || 'Desconocido';
        const provincia = propiedades.provincia || 'SANTA FE'; // Por defecto asumimos Santa Fe
        
        // Para depuración
        const nombreNormalizado = this.normalizarTexto(nombre);
        const provinciaNormalizada = this.normalizarTexto(provincia);
        
        // Determinar estado con depuración
        const estaEnADR = this.estaEnADR(provinciaNormalizada, nombreNormalizado);
        const tieneDatos = this.tieneDatos(provinciaNormalizada, nombreNormalizado);
        
        // Obtener los datos completos si existen
        const datosDepartamento = this.obtenerDatosDepartamento(provinciaNormalizada, nombreNormalizado);
        
        // Construir el contenido del popup según si hay datos o no
        let popupContent = `
          <div class="departamento-popup">
            <h3>${nombre}</h3>
            <p>Provincia: ${provincia}</p>
        `;
        
        if (!estaEnADR) {
          popupContent += `<p>Estado: Fuera de ADR</p>`;
        } else if (tieneDatos && datosDepartamento) {
          // Si tiene datos, mostramos todos los detalles
          popupContent += `
            <p>Estado: Con datos</p>
            <div class="datos-detalle">
              <h4>Información detallada:</h4>
              <table>
                <tr>
                  <td>Titulares:</td>
                  <td>${datosDepartamento.recuentoTitular}</td>
                </tr>
                <tr>
                  <td>Establecimientos:</td>
                  <td>${datosDepartamento.recuentoEstablecimiento}</td>
                </tr>
                <tr>
                  <td>Hectáreas sembradas:</td>
                  <td>${datosDepartamento.hectareasSembradas?.toLocaleString('es-AR')} ha</td>
                </tr>
                <tr>
                  <td>Hectáreas de no clientes:</td>
                  <td>${datosDepartamento.hectareasNoClientes?.toLocaleString('es-AR')} ha</td>
                </tr>
                <tr>
                  <td>% Hectáreas no clientes:</td>
                  <td>${datosDepartamento.porcentajeNoClientes}</td>
                </tr>
              </table>
            </div>
          `;
        } else {
          popupContent += `<p>Estado: Sin datos</p>`;
        }
        
        // Añadir información de depuración solo si no hay datos
        if (!tieneDatos || !datosDepartamento) {
          popupContent += `<p><small>En ADR: ${estaEnADR ? 'Sí' : 'No'}, Datos: ${tieneDatos ? 'Sí' : 'No'}</small></p>`;
        }
        
        popupContent += `</div>`;
        
        layer.bindPopup(popupContent);

        // Agregar efecto hover
        layer.on({
          mouseover: (e) => {
            const layer = e.target;
            layer.setStyle({
              weight: 3,
              color: '#666',
              fillOpacity: 0.7
            });
            layer.bringToFront();
          },
          mouseout: (e) => {
            this.geoJsonLayer?.resetStyle(e.target);
          },
          click: (e) => {
            this.map.fitBounds(e.target.getBounds());
          }
        });
      }
    }).addTo(this.map);

    // Ajustar la vista al tamaño del GeoJSON
    if (this.geoJsonLayer.getBounds().isValid()) {
      this.map.fitBounds(this.geoJsonLayer.getBounds());
    }
  }

  private estilizarDepartamento(feature: any): L.PathOptions {
    const propiedades = feature.properties;
    const nombre = propiedades.departamento || propiedades.nam || propiedades.nombre || '';
    const provincia = propiedades.provincia || 'SANTA FE'; // Por defecto asumimos Santa Fe
    
    // Normalizar nombre para comparar
    const nombreNormalizado = this.normalizarTexto(nombre);
    const provinciaNormalizada = this.normalizarTexto(provincia);
    
    // Determinar si está en ADR
    const estaEnADR = this.estaEnADR(provinciaNormalizada, nombreNormalizado);
    
    // Determinar si tiene datos
    const tieneDatos = this.tieneDatos(provinciaNormalizada, nombreNormalizado);
    
    // Aplicar colores según reglas:
    // 🔘 Gris: No pertenece a ADR (adr = 0)
    // 🔵 Azul: Pertenece a ADR (adr = 1) pero no tiene datos
    // ✅ Verde: Pertenece a ADR (adr = 1) y tiene datos
    
    let color = '#808080'; // Gris por defecto
    let opacity = 0.7;
    
    if (estaEnADR) {
      if (tieneDatos) {
        color = '#4CAF50'; // Verde
      } else {
        color = '#3388ff'; // Azul
      }
    }
    
    return {
      color: '#333',
      weight: 1,
      opacity: 0.8,
      fillColor: color,
      fillOpacity: opacity
    };
  }

  private estaEnADR(provincia: string, departamento: string): boolean {
    // Verificación especial para Santa Fe
    if (provincia === 'santa fe' || provincia === 'santafe') {
      const santaFeDept = this.departamentosADR.find(d => 
        (d.provincia === 'santa fe' || d.provincia === 'santafe' || d.provincia === 'santa_fe') && 
        d.departamento === departamento
      );
      
      return santaFeDept ? santaFeDept.en_adr === 1 : false;
    }
    
    const departamentoADR = this.departamentosADR.find(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    });
    
    return departamentoADR ? departamentoADR.en_adr === 1 : false;
  }

  private tieneDatos(provincia: string, departamento: string): boolean {
    // Verificación especial para Santa Fe
    if (provincia === 'santa fe' || provincia === 'santafe') {
      return this.departamentosConDatos.some(d => 
        (d.provincia === 'santa fe' || d.provincia === 'santafe') && 
        d.departamento === departamento
      );
    }
    
    return this.departamentosConDatos.some(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    });
  }

  private obtenerDatosDepartamento(provincia: string, departamento: string): DepartamentoDatos | null {
    // Verificación especial para Santa Fe
    if (provincia === 'santa fe' || provincia === 'santafe') {
      return this.departamentosConDatos.find(d => 
        (d.provincia === 'santa fe' || d.provincia === 'santafe') && 
        d.departamento === departamento
      ) || null;
    }
    
    return this.departamentosConDatos.find(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    }) || null;
  }

  private determinarEstadoDepartamento(provincia: string, departamento: string): string {
    const provinciaNormalizada = this.normalizarTexto(provincia);
    const departamentoNormalizado = this.normalizarTexto(departamento);
    
    if (!this.estaEnADR(provinciaNormalizada, departamentoNormalizado)) {
      return 'Sin datos';
    }
    
    if (this.tieneDatos(provinciaNormalizada, departamentoNormalizado)) {
      return 'Con datos';
    }
    
    return 'Sin datos';
  }
  
  private determinarEstadoConDebug(provincia: string, departamento: string): string {
    const adrRecord = this.departamentosADR.find(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    });
    
    const datosRecord = this.departamentosConDatos.find(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    });
    
    if (!adrRecord || adrRecord.en_adr !== 1) {
      return 'Sin datos';
    }
    
    if (datosRecord) {
      return 'Con datos';
    }
    
    return 'Sin datos';
  }

  private normalizarTexto(texto: string): string {
    if (!texto) return '';
    
    return texto.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\./g, '')
      .replace(/_/g, ' ')
      .trim();
  }
}