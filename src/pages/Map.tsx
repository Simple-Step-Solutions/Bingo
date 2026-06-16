import React, { useState, useEffect } from 'react';
import { UserProfile, Business, Town } from '../types';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { MapPin, Store, Navigation, Loader2, Search, ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { trackActivity } from '../services/activityService';

interface MapProps {
  user: UserProfile;
}

export const Map: React.FC<MapProps> = ({ user }) => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [town, setTown] = useState('Yorktown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeTowns = onSnapshot(collection(db, 'towns'), (snapshot) => {
      setTowns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Town)));
    });
    return () => unsubscribeTowns();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'businesses'), where('town', '==', town));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBusinesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [town]);

  // Fix for Leaflet marker icons
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  const center: [number, number] = [41.2723, -73.8055];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h2 className="font-serif italic text-5xl mb-2">Business Map</h2>
          <p className="text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold">Discover Local Partners</p>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto py-2">
          {towns.map(t => (
            <button 
              key={t.id}
              onClick={() => setTown(t.name)}
              className={`px-6 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap shadow-sm hover:shadow-md ${town === t.name ? 'bg-neutral-900 text-white shadow-lg scale-105' : 'bg-white border border-neutral-200 text-neutral-400 hover:border-neutral-900 hover:text-neutral-900'}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-[650px] bg-neutral-100 rounded-[3rem] overflow-hidden border border-neutral-200 shadow-2xl relative z-0">
          <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {businesses.filter(b => b.lat && b.lng).map(biz => (
              <Marker key={biz.id} position={[biz.lat!, biz.lng!]}>
                <Popup className="rounded-2xl overflow-hidden">
                  <div className="p-4 max-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="bg-neutral-900 p-1.5 rounded-lg">
                        <Store className="text-white" size={14} />
                      </div>
                      <h4 className="font-bold text-sm leading-tight">{biz.name}</h4>
                    </div>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-3">{biz.task}</p>
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackActivity(user.uid, 'click_directions', { businessId: biz.id, businessName: biz.name })}
                      className="flex items-center justify-center gap-2 w-full bg-neutral-100 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-200 transition-all"
                    >
                      <Navigation size={12} /> Directions
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="space-y-4 max-h-[650px] overflow-y-auto pr-2">
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400 mb-4 px-2">Businesses in {town}</h3>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-neutral-200" size={32} />
            </div>
          ) : businesses.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-neutral-100">
              <Store className="mx-auto text-neutral-100 mb-4" size={48} />
              <p className="text-neutral-400 text-sm italic">No businesses listed yet.</p>
            </div>
          ) : (
            businesses.map(biz => (
              <div key={biz.id} className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm hover:shadow-md hover:border-neutral-900 transition-all group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400 group-hover:text-neutral-900 transition-colors">
                    <Store size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{biz.name}</h4>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{biz.task}</p>
                  </div>
                </div>
                {biz.address && (
                  <p className="text-[10px] text-neutral-500 mb-4 flex items-start gap-2 leading-relaxed">
                    <MapPin size={12} className="shrink-0 mt-0.5" /> {biz.address}
                  </p>
                )}
                <div className="flex gap-2">
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackActivity(user.uid, 'click_directions', { businessId: biz.id, businessName: biz.name })}
                    className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 text-white py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all"
                  >
                    <Navigation size={12} /> Directions
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
