FROM osrm/osrm-backend@sha256:af5d4a83fb90086a43b1ae2ca22872e6768766ad5fcbb07a29ff90ec644ee409 AS graph-build

WORKDIR /data
COPY generated/sri-lanka-routing.osm.pbf /data/source.osm.pbf

# Build three independent MLD datasets from the same checksummed Sri Lanka
# OSM snapshot. Each runtime Container loads only the requested profile.
RUN set -eux; \
    for profile in car foot bicycle; do \
      cp /data/source.osm.pbf "/data/${profile}.osm.pbf"; \
      osrm-extract -p "/opt/${profile}.lua" "/data/${profile}.osm.pbf"; \
      osrm-partition "/data/${profile}.osrm"; \
      osrm-customize "/data/${profile}.osrm"; \
      rm "/data/${profile}.osm.pbf"; \
    done; \
    rm /data/source.osm.pbf

FROM osrm/osrm-backend@sha256:af5d4a83fb90086a43b1ae2ca22872e6768766ad5fcbb07a29ff90ec644ee409 AS router

WORKDIR /data
COPY --from=graph-build /data/ /data/
COPY routing/entrypoint.sh /usr/local/bin/mazo-osrm-entrypoint
RUN chmod 0555 /usr/local/bin/mazo-osrm-entrypoint

EXPOSE 5000
ENTRYPOINT ["/usr/local/bin/mazo-osrm-entrypoint"]
