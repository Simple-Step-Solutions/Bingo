import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, Completion, Business, AppSettings } from '../../types';
import { Users, CheckCircle2, Trophy, MapPin, TrendingUp, Star, Activity as ActivityIcon, Eye, ShoppingBag, Clock } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PlayerIcon = L.divIcon({
  className: 'custom-div-icon',
  html: "<div style='background-color: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);'></div>",
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const BusinessIcon = L.divIcon({
  className: 'custom-div-icon',
  html: "<div style='background-color: #171717; width: 10px; height: 10px; border-radius: 2px; border: 1px solid white;'></div>",
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

interface AnalyticsProps {
  users: UserProfile[];
  completions: Completion[];
  businesses: Business[];
  settings: AppSettings;
  currentUser: UserProfile;
}

export const Analytics: React.FC<AnalyticsProps> = ({ users, completions, businesses, settings, currentUser }) => {
  const [showMap, setShowMap] = useState(true);
  const globalSize = settings.boardSize || 3;

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  const canSeeMap = currentUser.role === 'admin' || settings.showRealtimeMapToChamber;
  const isAdmin = currentUser.role === 'admin';

  const checkBingo = (board: string[], userCompletions: Completion[], userBoardSize?: number) => {
    if (!board || board.length === 0) return false;
    const size = userBoardSize || Math.sqrt(board.length) || globalSize;
    if (board.length !== size * size) return false;

    const completedIds = new Set(userCompletions.map(c => c.businessId));
    const grid: string[][] = [];
    for (let i = 0; i < board.length; i += size) {
      const row = board.slice(i, i + size);
      if (row.length === size) grid.push(row);
    }

    if (grid.length !== size) return false;

    for (let r = 0; r < size; r++) {
      if (grid[r].every(id => id === 'FREE' || completedIds.has(id))) return true;
    }
    for (let c = 0; c < size; c++) {
      let colDone = true;
      for (let r = 0; r < size; r++) {
        const id = grid[r][c];
        if (id !== 'FREE' && !completedIds.has(id)) {
          colDone = false;
          break;
        }
      }
      if (colDone) return true;
    }
    let d1 = true, d2 = true;
    for (let i = 0; i < size; i++) {
      const id1 = grid[i][i];
      const id2 = grid[i][size - 1 - i];
      if (id1 !== 'FREE' && !completedIds.has(id1)) d1 = false;
      if (id2 !== 'FREE' && !completedIds.has(id2)) d2 = false;
    }
    return d1 || d2;
  };

  const players = users.filter(u => u.role === 'player' || u.bingoBoard?.length);
  const bingoFinishers = players.filter(u => {
    const userCompletions = completions.filter(c => c.userId === u.uid);
    return checkBingo(u.bingoBoard || [], userCompletions, u.boardSize);
  });

  const activePlayers = players.filter(u => {
    if (!u.lastActive || !u.currentLocation) return false;
    const lastActive = new Date(u.lastActive).getTime();
    const now = new Date().getTime();
    return now - lastActive < 5 * 60 * 1000;
  });

  const leaderboard = users
    .map(u => ({
      ...u,
      count: completions.filter(c => c.userId === u.uid).length,
      hasBingo: bingoFinishers.some(f => f.uid === u.uid)
    }))
    .filter(u => u.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const townStats = completions.reduce((acc, c) => {
    acc[c.town] = (acc[c.town] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryStats = completions.reduce((acc, c) => {
    const biz = businesses.find(b => b.id === c.businessId);
    const category = biz?.category || 'Other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bizStats = completions.reduce((acc, c) => {
    acc[c.businessId] = (acc[c.businessId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topBusinesses = Object.entries<number>(bizStats)
    .map(([id, count]) => ({
      biz: businesses.find(b => b.id === id),
      count
    }))
    .filter(item => item.biz)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topShoppingTime = useMemo(() => {
    if (completions.length === 0) return 'N/A';
    const hours = completions.map(c => new Date(c.timestamp).getHours());
    const counts = hours.reduce((acc, h) => {
      acc[h] = (acc[h] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const sorted = Object.entries<number>(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return 'N/A';
    const topHour = sorted[0][0];
    const hour = parseInt(topHour);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour} ${ampm}`;
  }, [completions]);

  const summaryStats = [
    { label: 'Total Players', value: players.length, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Total Visits', value: completions.length, icon: CheckCircle2, color: 'bg-green-50 text-green-600' },
    { label: 'Bingo Finishers', value: bingoFinishers.length, icon: Trophy, color: 'bg-orange-50 text-orange-600' },
    { label: 'Active Now', value: activePlayers.length, icon: ActivityIcon, color: 'bg-purple-50 text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      {/* Summary stat cards: big number, small label */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryStats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm flex flex-col gap-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>
              <Icon size={18} />
            </div>
            <p className="text-4xl font-black text-neutral-900 leading-none">{value}</p>
            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Real-time Map */}
      {canSeeMap && (
        <div className="bg-white border border-neutral-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="bg-neutral-100 p-2 rounded-xl">
                <MapPin className="text-neutral-900" size={20} />
              </div>
              <div>
                <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Live Player Map</h3>
                <p className="text-[10px] text-neutral-400 italic mt-0.5">Businesses and active players in real-time</p>
              </div>
            </div>
            <button
              onClick={() => setShowMap(!showMap)}
              className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 hover:text-neutral-900 transition-colors"
            >
              {showMap ? 'Hide' : 'Show'}
            </button>
          </div>

          {showMap && (
            <div className="h-[300px] md:h-[500px]">
              <MapContainer
                center={[41.2915, -73.7235]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {businesses.filter(b => b.lat && b.lng).map(biz => (
                  <Marker key={biz.id} position={[biz.lat!, biz.lng!]} icon={BusinessIcon}>
                    <Popup>
                      <div className="p-2">
                        <p className="font-bold text-sm">{biz.name}</p>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-widest">{biz.category}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                {activePlayers.map(player => (
                  <Marker key={player.uid} position={[player.currentLocation!.lat, player.currentLocation!.lng]} icon={PlayerIcon}>
                    <Popup>
                      <div className="p-2">
                        <p className="font-bold text-sm">{player.displayName || player.email.split('@')[0]}</p>
                        <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Active Now</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Leaderboard */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-neutral-100 p-2 rounded-xl">
              <TrendingUp className="text-neutral-900" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Top Players</h3>
          </div>

          <div className="space-y-2">
            {leaderboard.map((u, idx) => (
              <div key={u.uid} className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                    idx === 1 ? 'bg-neutral-200 text-neutral-600' :
                    idx === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-white border border-neutral-100 text-neutral-400'
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-bold text-sm flex items-center gap-1.5">
                      {u.displayName || u.email.split('@')[0]}
                      {u.hasBingo && <Star size={11} className="text-orange-500 fill-orange-500" />}
                    </p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{u.town || 'No Town'}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-lg leading-none">{u.count}</p>
                  <p className="text-[8px] text-neutral-400 uppercase tracking-widest font-bold">Visits</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Insights */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-neutral-100 p-2 rounded-xl">
              <ShoppingBag className="text-neutral-900" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Category Preferences</h3>
          </div>

          <div className="space-y-5">
            {Object.entries<number>(categoryStats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <div key={cat}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-neutral-600">{cat}</span>
                  <span className="text-xs font-bold text-neutral-900">{count}</span>
                </div>
                <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${(count / completions.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Businesses */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-neutral-100 p-2 rounded-xl">
              <Eye className="text-neutral-900" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Most Visited</h3>
          </div>

          <div className="space-y-2">
            {topBusinesses.map((item, idx) => (
              <div key={item.biz?.id} className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-neutral-50 rounded-lg flex items-center justify-center text-neutral-400 font-bold text-xs border border-neutral-100 shrink-0">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{item.biz?.name}</p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{item.biz?.town}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-lg leading-none">{item.count}</p>
                  <p className="text-[8px] text-neutral-400 uppercase tracking-widest font-bold">Visits</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Town Distribution */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-neutral-100 p-2 rounded-xl">
              <MapPin className="text-neutral-900" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Town Distribution</h3>
          </div>

          <div className="space-y-5">
            {Object.entries<number>(townStats).sort((a, b) => b[1] - a[1]).map(([town, count]) => (
              <div key={town}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-neutral-600">{town}</span>
                  <span className="text-xs font-bold text-neutral-900">{count} visits</span>
                </div>
                <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 rounded-full"
                    style={{ width: `${(count / completions.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Behavior Insights -- now white/light, not dark */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-neutral-100 p-2 rounded-xl">
              <Clock className="text-neutral-900" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">User Behavior Insights</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-neutral-50 border border-neutral-100 p-5 rounded-2xl">
              <p className="text-3xl font-black text-neutral-900 leading-none mb-1">
                {(completions.length / (players.length || 1)).toFixed(1)}
              </p>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Avg Visits / Player</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-100 p-5 rounded-2xl">
              <p className="text-3xl font-black text-neutral-900 leading-none mb-1">
                {((bingoFinishers.length / (players.length || 1)) * 100).toFixed(0)}%
              </p>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Bingo Success Rate</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-100 p-5 rounded-2xl">
              <p className="text-3xl font-black text-neutral-900 leading-none mb-1">
                {players.filter(u => u.metadata?.hasClickedDirections).length}
              </p>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Directions Used</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-100 p-5 rounded-2xl">
              <p className="text-3xl font-black text-neutral-900 leading-none mb-1">
                {players.filter(u => u.metadata?.hasOpenedAppMultipleTimes).length}
              </p>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Repeat Users</p>
            </div>
          </div>

          <div className="mt-4 p-5 bg-neutral-50 border border-neutral-100 rounded-2xl">
            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-3">Top Shopping Time</p>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-primary)] w-full" />
              </div>
              <span className="text-sm font-bold text-neutral-900">{topShoppingTime}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
