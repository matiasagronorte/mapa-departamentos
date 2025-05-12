import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as topojson from 'topojson-client';
import { CommonModule } from '@angular/common';

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

  constructor() { }

  ngOnInit(): void {
    this.initMap();
    this.loadTopoJson();
  }

  private initMap(): void {
    // Crear el mapa
    this.map = L.map('map', {
      center: [-31.6333, -60.7000], // Coordenadas de Santa Fe capital
      zoom: 7, // Zoom inicial para ver la provincia de Santa Fe
      zoomControl: true
    });

    // Agregar capa base de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    console.log('Mapa inicializado correctamente');
  }

  private loadTopoJson(): void {
    // Cargar el archivo TopoJSON
    fetch('assets/departamentos-santa_fe.topojson')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        return response.json();
      })
      .then(topoData => {
        console.log('TopoJSON cargado:', topoData);
        
        // Convertir TopoJSON a GeoJSON
        if (topoData && topoData.objects) {
          // Obtener el nombre de la primera propiedad en objects
          const objectName = Object.keys(topoData.objects)[0];
          
          if (objectName) {
            const geoJsonData = topojson.feature(topoData, topoData.objects[objectName]);
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
    console.log('GeoJSON a renderizar:', geoJsonData);

    // Eliminar la capa anterior si existe
    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    // Crear una nueva capa GeoJSON
    this.geoJsonLayer = L.geoJSON(geoJsonData, {
      style: () => ({
        color: '#3388ff',
        weight: 2,
        opacity: 0.8,
        fillColor: '#3388ff',
        fillOpacity: 0.2
      }),
      onEachFeature: (feature, layer) => {
        // Asignar popup con el nombre del departamento y población
        const propiedades = feature.properties;
        const nombre = propiedades.nam || propiedades.nombre || propiedades.departamento || 'Desconocido';
        const poblacion = propiedades.poblacion ? `<p>Población: ${propiedades.poblacion.toLocaleString()}</p>` : '';
        
        layer.bindPopup(`
          <div class="departamento-popup">
            <h3>${nombre}</h3>
            ${poblacion}
          </div>
        `);

        // Agregar efecto hover
        layer.on({
          mouseover: (e) => {
            const layer = e.target;
            layer.setStyle({
              weight: 3,
              color: '#666',
              fillOpacity: 0.4
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
}