import React from 'react'
import { Map, Marker, Overlay } from 'pigeon-maps'

const PigeonMapView = ({ coordinates, location, height = 256, className = "" }) => {
    const position = [coordinates.lat, coordinates.lng]

    return (
        <div className={`w-full rounded-lg overflow-hidden border aspect-square lg:aspect-auto ${className}`} 
             style={{ height: height }}>
            <Map
                center={position}
                zoom={10}
                height={height}
                metaWheelZoom={true}
                metaWheelZoomWarning="Use Ctrl + Wheel to zoom"
            >
                <Marker
                    width={30}
                    anchor={position}
                    color="#2563eb"
                    onClick={() => {}}
                />
                <Overlay anchor={position} offset={[0, 20]}>
                    <div className="bg-white px-2 py-1 rounded text-xs shadow-lg border">
                        {location}
                    </div>
                </Overlay>
            </Map>
        </div>
    )
}

export default PigeonMapView
