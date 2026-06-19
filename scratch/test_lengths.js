const luxurySocieties = [
    { name: "Prestige Kingfisher Towers" },
    { name: "Phoenix One Bangalore West" },
    { name: "Total Environment Windmills" },
    { name: "Embassy Boulevard" },
    { name: "Sobha Royal Pavilion" },
    { name: "Karle Infra Zenith" },
    { name: "Mantri Alpyne Premium Enclave" },
    { name: "Purva Whitehall" },
    { name: "Salarpuria Sattva Magnificia" },
    { name: "Brigade Exotica" },
    { name: "Assetz Marq Elite" },
    { name: "Godrej Woodland Estate" },
    { name: "Adarsh Palm Retreat" },
    { name: "Vaishnavi Terraces" },
    { name: "Shriram Chirping Woods" },
    { name: "Adani Shantigram Water Lily" },
    { name: "Arvind Uplands Premium Pavilion" },
    { name: "Goyal & Co. Riviera Elite" },
    { name: "Shaligram Prime Royale" },
    { name: "Iscon Platinum Towers" },
    { name: "Sangath Silver Sky" },
    { name: "Venus Riviera Enclave" },
    { name: "Rajhans Elita Premium" },
    { name: "Green Group Signature Towers" },
    { name: "Avadh Viceroy Residences" },
    { name: "Sun Reality Solitaire" },
    { name: "Happy Home Celebrity Greens" },
    { name: "Alembic Kiara Royal Residency" },
    { name: "Narayan Heritage Square" },
    { name: "Woodside Premium Orchards" }
];

console.log("=== VERIFYING DATABASE NAME LENGTHS ===");
luxurySocieties.forEach(ls => {
    const dbName = 'soc_' + ls.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    console.log(`${ls.name.padEnd(40)} -> ${dbName} (${dbName.length} chars) - ${dbName.length <= 38 ? 'OK' : 'TOO LONG'}`);
});
