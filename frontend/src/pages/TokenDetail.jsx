import { useParams } from 'react-router-dom';

export default function TokenDetail() {
  const { id } = useParams();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Token Detail: {id}</h1>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p className="text-gray-400">Breakdown scoring per gate akan ditampilkan di sini.</p>
      </div>
    </div>
  );
}
